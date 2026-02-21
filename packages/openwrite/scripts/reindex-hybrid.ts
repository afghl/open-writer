import { promises as fs } from "node:fs"
import path from "node:path"
import { Storage } from "../src/storage"
import { resolveWorkspacePath } from "../src/path"
import { chunkText, embedChunks } from "../src/library/etl"
import { parseFileBuffer } from "../src/library/parser"
import { sparseVectorFromText, PineconeService } from "../src/vectorstore"
import { LibraryDocInfo, type LibraryDocInfo as LibraryDocInfoType } from "../src/library/types"

function usage() {
  console.log("Usage: bun run scripts/reindex-hybrid.ts <project_id> [doc_id]")
}

function deriveSourceTextPath(projectID: string, docPath: string) {
  const fileName = path.basename(docPath).replace(/\.[^.]+$/, "")
  return `projects/${projectID}/workspace/inputs/library/docs/text/${fileName}.txt`
}

async function ensureCanonicalText(projectID: string, doc: LibraryDocInfoType) {
  const sourceTextPath = doc.source_text_path || deriveSourceTextPath(projectID, doc.doc_path)

  try {
    const { resolvedPath } = resolveWorkspacePath(sourceTextPath, projectID)
    const text = await fs.readFile(resolvedPath, "utf8")
    if (text.trim().length > 0) {
      return {
        sourceTextPath,
        text,
      }
    }
  } catch {
    // Fall through to rebuild from source doc.
  }

  const { resolvedPath: docResolvedPath } = resolveWorkspacePath(doc.doc_path, projectID)
  const bytes = await fs.readFile(docResolvedPath)
  const parsed = await parseFileBuffer({
    ext: doc.file_ext,
    buffer: bytes,
  })

  const { resolvedPath } = resolveWorkspacePath(sourceTextPath, projectID)
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
  await fs.writeFile(resolvedPath, parsed.text, "utf8")

  return {
    sourceTextPath,
    text: parsed.text,
  }
}

async function main() {
  const projectID = process.argv[2]?.trim() ?? ""
  const docIDFilter = process.argv[3]?.trim() || undefined

  if (!projectID) {
    usage()
    process.exit(1)
  }

  const pinecone = new PineconeService()
  if (!pinecone.enabled) {
    throw new Error("Pinecone is not configured. Set PINECONE_API_KEY and OW_PINECONE_INDEX.")
  }

  const segments = await Storage.list(["library_doc", projectID])
  if (segments.length === 0) {
    console.log("No docs found.")
    return
  }

  for (const segment of segments) {
    const raw = await Storage.read<LibraryDocInfoType>(segment)
    const doc = LibraryDocInfo.parse(raw)

    if (docIDFilter && doc.id !== docIDFilter) {
      continue
    }

    const canonical = await ensureCanonicalText(projectID, doc)
    const chunks = chunkText({
      docID: doc.id,
      text: canonical.text,
    })
    const embeddings = await embedChunks({
      chunks,
      requireRemoteEmbedding: true,
    })

    const vectorIDs = embeddings.map((item) => item.id)
    await pinecone.upsert(projectID, embeddings.map((embedding, index) => ({
      id: embedding.id,
      values: embedding.values,
      sparseValues: sparseVectorFromText(chunks[index]?.text ?? ""),
      metadata: {
        project_id: projectID,
        doc_id: doc.id,
        chunk_id: embedding.id,
        chunk_index: chunks[index]?.index ?? index,
        source_type: doc.source_type,
        source_path: doc.doc_path,
        source_text_path: canonical.sourceTextPath,
        offset_start: chunks[index]?.offset_start ?? 0,
        text_len: chunks[index]?.text_len ?? 0,
        snippet: chunks[index]?.snippet ?? "",
      },
    })))

    const staleIDs = doc.vector_ids.filter((id) => !vectorIDs.includes(id))
    if (staleIDs.length > 0) {
      await pinecone.delete(projectID, staleIDs)
    }

    await Storage.update<LibraryDocInfoType>(["library_doc", projectID, doc.id], (draft) => {
      draft.vector_ids = vectorIDs
      draft.chunk_count = chunks.length
      draft.source_text_path = canonical.sourceTextPath
      draft.updated_at = Date.now()
    })

    console.log(`Reindexed ${doc.id}: ${chunks.length} chunks`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
