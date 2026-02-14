import { promises as fs } from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { Storage } from "@/storage"
import { Identifier } from "@/id"
import { resolveWorkspacePath } from "@/path"
import { publishInProject } from "@/bus"
import { fsCreated, fsUpdated } from "@/bus"
import { chunkText, embedChunks } from "./etl"
import { parseFileBuffer, parseYouTubeTranscript, makeShortHash } from "./parser"
import { PineconeService } from "./pinecone"
import { buildSummary, renderSummaryMarkdown, slugifyTitle } from "./summary"
import {
  LibraryDocInfo,
  LibraryImportInfo,
  LibraryServiceError,
  type LibraryDocStatus,
  type LibraryFileExt,
  type LibraryImportInfo as LibraryImportInfoType,
  type LibraryImportMode,
  type SummaryRecord,
} from "./types"

// Keep defaults Vercel-friendly when Web uploads are proxied through API routes.
const DEFAULT_IMPORT_MAX_PDF_MB = 4
const DEFAULT_IMPORT_MAX_TXT_MB = 4

function dataDir() {
  return process.env.OW_DATA_DIR ?? path.join(process.cwd(), ".openwrite")
}

const pinecone = new PineconeService()

function docsRootLogical(projectID: string) {
  return `projects/${projectID}/workspace/inputs/library/docs`
}

function summaryRootLogical(projectID: string) {
  return `projects/${projectID}/workspace/inputs/library/docs/summary`
}

function summaryIndexLogical(projectID: string) {
  return `projects/${projectID}/workspace/inputs/library/docs/summary/index.md`
}

function oldSummaryRootLogical(projectID: string) {
  return `projects/${projectID}/workspace/inputs/library/summary/docs`
}

function oldSummaryIndexLogical(projectID: string) {
  return `projects/${projectID}/workspace/inputs/library/summary/index.md`
}

function readIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.floor(parsed)
}

function importMaxBytesForExt(ext: LibraryFileExt) {
  if (ext === "pdf") {
    return readIntEnv("OW_IMPORT_MAX_PDF_MB", DEFAULT_IMPORT_MAX_PDF_MB) * 1024 * 1024
  }
  return readIntEnv("OW_IMPORT_MAX_TXT_MB", DEFAULT_IMPORT_MAX_TXT_MB) * 1024 * 1024
}

function getPayloadPath(projectID: string, importID: string, ext: LibraryFileExt) {
  return path.join(dataDir(), "library_import_payload", projectID, `${importID}.${ext}`)
}

function buildDocID(importID: string, title: string) {
  return `doc_${makeShortHash(`${importID}:${title}:${Date.now()}:${Math.random()}`)}`
}

async function readImport(projectID: string, importID: string) {
  const item = await Storage.read<LibraryImportInfoType>(["library_import", projectID, importID])
  return LibraryImportInfo.parse(item)
}

async function writeImport(projectID: string, item: LibraryImportInfoType) {
  await Storage.write(["library_import", projectID, item.id], item)
}

async function updateImport(
  projectID: string,
  importID: string,
  editor: (draft: LibraryImportInfoType) => void,
) {
  const current = await readImport(projectID, importID)
  const draft: LibraryImportInfoType = {
    ...current,
    input: { ...current.input },
    time: { ...current.time },
    ...(current.error ? { error: { ...current.error } } : {}),
    ...(current.result ? { result: { ...current.result } } : {}),
  }
  editor(draft)
  await writeImport(projectID, draft)
  return draft
}

async function readDoc(projectID: string, docID: string) {
  const item = await Storage.read<LibraryDocInfo>(["library_doc", projectID, docID])
  return LibraryDocInfo.parse(item)
}

async function tryReadDoc(projectID: string, docID: string) {
  try {
    return await readDoc(projectID, docID)
  } catch {
    return undefined
  }
}

async function writeDoc(projectID: string, doc: LibraryDocInfo) {
  await Storage.write(["library_doc", projectID, doc.id], doc)
}

function asError(error: unknown) {
  if (error instanceof LibraryServiceError) {
    return {
      code: error.code,
      message: error.message,
    }
  }
  if (error instanceof Error) {
    return {
      code: "IMPORT_FAILED",
      message: error.message,
    }
  }
  return {
    code: "IMPORT_FAILED",
    message: String(error),
  }
}

async function ensureDir(target: string) {
  await fs.mkdir(target, { recursive: true })
}

async function fileExists(target: string) {
  try {
    await fs.stat(target)
    return true
  } catch {
    return false
  }
}

async function moveFileIfNeeded(fromPath: string, toPath: string) {
  if (!(await fileExists(fromPath))) return false
  await ensureDir(path.dirname(toPath))
  await fs.rename(fromPath, toPath)
  return true
}

async function ensureSummaryLayout(projectID: string) {
  const { resolvedPath: oldDocsResolved } = resolveWorkspacePath(oldSummaryRootLogical(projectID), projectID)
  const { resolvedPath: newDocsResolved } = resolveWorkspacePath(summaryRootLogical(projectID), projectID)
  const { resolvedPath: oldIndexResolved } = resolveWorkspacePath(oldSummaryIndexLogical(projectID), projectID)
  const { resolvedPath: newIndexResolved } = resolveWorkspacePath(summaryIndexLogical(projectID), projectID)

  await ensureDir(newDocsResolved)

  const [oldEntries, newEntries] = await Promise.all([
    fs.readdir(oldDocsResolved, { withFileTypes: true }).catch(() => []),
    fs.readdir(newDocsResolved, { withFileTypes: true }).catch(() => []),
  ])

  if (newEntries.length === 0 && oldEntries.length > 0) {
    for (const entry of oldEntries) {
      if (!entry.isFile()) continue
      await moveFileIfNeeded(
        path.join(oldDocsResolved, entry.name),
        path.join(newDocsResolved, entry.name),
      )
    }
  }

  const newIndexExists = await fileExists(newIndexResolved)
  if (!newIndexExists) {
    await moveFileIfNeeded(oldIndexResolved, newIndexResolved)
  }
}

async function writeWorkspaceFile(input: {
  projectID: string
  logicalPath: string
  content: string | Buffer
  source: "external_upload"
}) {
  const { resolvedPath, logicalNamespacePath } = resolveWorkspacePath(input.logicalPath, input.projectID)
  await ensureDir(path.dirname(resolvedPath))
  const existed = await fileExists(resolvedPath)
  if (typeof input.content === "string") {
    await fs.writeFile(resolvedPath, input.content, "utf8")
  } else {
    await fs.writeFile(resolvedPath, input.content)
  }
  await publishInProject(
    input.projectID,
    existed ? fsUpdated : fsCreated,
    {
      projectID: input.projectID,
      path: logicalNamespacePath,
      kind: "file",
      source: input.source,
      time: Date.now(),
    },
  )
  return {
    path: logicalNamespacePath,
    existed,
  }
}

function buildSummaryIndexMarkdown(projectID: string, docs: LibraryDocInfo[]) {
  const lines: string[] = []
  lines.push("# Library Summary Index")
  lines.push("")
  lines.push(`Generated at: ${new Date().toISOString()}`)
  lines.push("")

  if (docs.length === 0) {
    lines.push("No library docs imported yet.")
    lines.push("")
    return lines.join("\n")
  }

  for (const doc of docs) {
    lines.push(`## ${doc.title}`)
    lines.push(`- doc_id: ${doc.id}`)
    lines.push(`- source_type: ${doc.source_type}`)
    lines.push(`- doc_path: ${doc.doc_path}`)
    lines.push(`- summary_path: ${doc.summary_path}`)
    if (doc.source_url) {
      lines.push(`- source_url: ${doc.source_url}`)
    }
    lines.push(`- updated_at: ${new Date(doc.updated_at).toISOString()}`)
    lines.push("")
  }

  return lines.join("\n")
}

function normalizeTitle(input: SummaryRecord) {
  const title = input.title.replace(/\s+/g, " ").trim()
  return title.length > 0 ? title : "Untitled Document"
}

function normalizeSummaryItems(lines: string[]) {
  const result = lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
  return result.length > 0 ? result : ["N/A"]
}

function sourceLabel(input: {
  mode: LibraryImportMode
  fileName?: string
  url?: string
}) {
  if (input.mode === "url") {
    return input.url?.trim() || "YouTube URL"
  }
  return input.fileName?.trim() || "Uploaded file"
}

export async function createImport(input: {
    projectID: string
    replaceDocID?: string
    file?: {
      name: string
      type: string
      size: number
      bytes: Buffer
    }
    url?: string
  }) {
    const hasFile = !!input.file
    const hasURL = !!input.url?.trim()

    if ((hasFile && hasURL) || (!hasFile && !hasURL)) {
      throw new LibraryServiceError(
        "INVALID_IMPORT_INPUT",
        "Provide either file or url",
      )
    }

    const replaceDocID = input.replaceDocID?.trim() || undefined
    if (replaceDocID) {
      const existing = await tryReadDoc(input.projectID, replaceDocID)
      if (!existing) {
        throw new LibraryServiceError("REPLACE_DOC_NOT_FOUND", `Doc not found: ${replaceDocID}`)
      }
    }

    const importID = Identifier.ascending("import")
    const createdAt = Date.now()

    if (input.file) {
      const name = input.file.name?.trim() || ""
      if (!name) {
        throw new LibraryServiceError("INVALID_FILE", "File name is required")
      }

      const ext = name.toLowerCase().endsWith(".pdf")
        ? "pdf"
        : name.toLowerCase().endsWith(".txt")
          ? "txt"
          : ""
      if (!ext) {
        throw new LibraryServiceError("UNSUPPORTED_FILE_TYPE", "Only PDF and TXT files are supported")
      }

      const maxBytes = importMaxBytesForExt(ext as LibraryFileExt)
      if (input.file.size > maxBytes) {
        throw new LibraryServiceError(
          "FILE_TOO_LARGE",
          `File exceeds limit of ${Math.floor(maxBytes / (1024 * 1024))}MB`,
        )
      }

      const payloadPath = getPayloadPath(input.projectID, importID, ext as LibraryFileExt)
      await ensureDir(path.dirname(payloadPath))
      await fs.writeFile(payloadPath, input.file.bytes)

      const created: LibraryImportInfoType = {
        id: importID,
        project_id: input.projectID,
        input: {
          mode: "file",
          replace_doc_id: replaceDocID,
          file_name: name,
          file_ext: ext as LibraryFileExt,
          file_mime: input.file.type,
          file_size: input.file.size,
          payload_path: payloadPath,
        },
        status: "queued",
        stage: "queued",
        time: {
          created: createdAt,
        },
      }
      await writeImport(input.projectID, created)
      return created
    }

    const rawURL = input.url?.trim() || ""
    if (!rawURL) {
      throw new LibraryServiceError("INVALID_URL", "URL is required")
    }

    const created: LibraryImportInfoType = {
      id: importID,
      project_id: input.projectID,
      input: {
        mode: "url",
        replace_doc_id: replaceDocID,
        url: rawURL,
      },
      status: "queued",
      stage: "queued",
      time: {
        created: createdAt,
      },
    }
    await writeImport(input.projectID, created)
    return created
  }

export async function getImport(projectID: string, importID: string) {
  return readImport(projectID, importID)
}

export async function listDocs(projectID: string) {
  const segments = await Storage.list(["library_doc", projectID])
  const docs = await Promise.all(
    segments.map(async (item) => LibraryDocInfo.parse(await Storage.read<LibraryDocInfo>(item))),
  )
  docs.sort((a, b) => b.updated_at - a.updated_at)
  return docs.filter((doc) => doc.status === "ready")
}

export async function getDoc(projectID: string, docID: string) {
  return readDoc(projectID, docID)
}

export async function listPendingImports() {
  const all: LibraryImportInfoType[] = []
  const root = path.join(dataDir(), "library_import")
  const projectDirs = await fs.readdir(root, { withFileTypes: true }).catch(() => [])

    for (const projectEntry of projectDirs) {
      if (!projectEntry.isDirectory()) continue
      const projectID = projectEntry.name
      const importSegments = await Storage.list(["library_import", projectID])
      for (const importSegment of importSegments) {
        const item = await Storage.read<LibraryImportInfoType>(importSegment)
        if (item.status === "queued" || item.status === "processing") {
          all.push(item)
        }
      }
    }

  all.sort((a, b) => a.time.created - b.time.created)
  return all
}

  async function markStage(projectID: string, importID: string, stage: LibraryImportInfoType["stage"]) {
    return updateImport(projectID, importID, (draft) => {
      draft.status = "processing"
      draft.stage = stage
      if (!draft.time.started) {
        draft.time.started = Date.now()
      }
    })
  }

  async function markFail(projectID: string, importID: string, error: { code: string; message: string }) {
    return updateImport(projectID, importID, (draft) => {
      draft.status = "fail"
      draft.stage = "fail"
      draft.error = error
      draft.time.finished = Date.now()
    })
  }

  async function markSuccess(input: {
    projectID: string
    importID: string
    docID: string
    docPath: string
    summaryPath: string
  }) {
    return updateImport(input.projectID, input.importID, (draft) => {
      draft.status = "success"
      draft.stage = "success"
      draft.error = undefined
      draft.result = {
        doc_id: input.docID,
        doc_path: input.docPath,
        summary_path: input.summaryPath,
      }
      draft.time.finished = Date.now()
    })
  }

  async function refreshSummaryIndex(projectID: string) {
    const docs = await listDocs(projectID)
    const markdown = buildSummaryIndexMarkdown(projectID, docs)
    await writeWorkspaceFile({
      projectID,
      logicalPath: summaryIndexLogical(projectID),
      content: markdown,
      source: "external_upload",
    })
  }

  async function saveDoc(input: {
    projectID: string
    docID: string
    sourceType: "file" | "youtube"
    sourceURL?: string
    fileExt: LibraryFileExt
    docPath: string
    summaryPath: string
    title: string
    titleSlug: string
    vectorIDs: string[]
    chunkCount: number
    createdAt: number
    updatedAt: number
    status: LibraryDocStatus
  }) {
    const doc: LibraryDocInfo = {
      id: input.docID,
      project_id: input.projectID,
      title: input.title,
      title_slug: input.titleSlug,
      source_type: input.sourceType,
      source_url: input.sourceURL,
      file_ext: input.fileExt,
      doc_path: input.docPath,
      summary_path: input.summaryPath,
      vector_ids: input.vectorIDs,
      chunk_count: input.chunkCount,
      status: input.status,
      created_at: input.createdAt,
      updated_at: input.updatedAt,
    }
    await writeDoc(input.projectID, doc)
    return doc
  }

export async function processImport(importTask: LibraryImportInfoType) {
    const projectID = importTask.project_id
    const importID = importTask.id

    await markStage(projectID, importID, "validating")

    let payloadPath = importTask.input.payload_path

    try {
      await ensureSummaryLayout(projectID)

      const replaceDocID = importTask.input.replace_doc_id?.trim() || ""
      const replaceDoc = replaceDocID ? await readDoc(projectID, replaceDocID) : undefined

      await markStage(projectID, importID, "ingesting")

      let fileExt: LibraryFileExt
      let rawBytes: Buffer
      let parsedText = ""
      let sourceType: "file" | "youtube" = "file"
      let canonicalURL = ""

      await markStage(projectID, importID, "parsing")
      if (importTask.input.mode === "file") {
        const ext = importTask.input.file_ext
        const rawPath = importTask.input.payload_path
        if (!ext || !rawPath) {
          throw new LibraryServiceError("INVALID_IMPORT_INPUT", "Missing upload payload")
        }
        fileExt = ext
        payloadPath = rawPath
        rawBytes = await fs.readFile(rawPath)
        const parsed = await parseFileBuffer({
          ext,
          buffer: rawBytes,
        })
        sourceType = parsed.sourceType
        parsedText = parsed.text
      } else {
        const rawURL = importTask.input.url?.trim() || ""
        if (!rawURL) {
          throw new LibraryServiceError("INVALID_URL", "URL is required")
        }
        const parsed = await parseYouTubeTranscript(rawURL)
        sourceType = parsed.sourceType
        parsedText = parsed.text
        canonicalURL = parsed.canonicalURL ?? ""
        rawBytes = Buffer.from(parsed.text, "utf8")
        fileExt = "txt"
      }

      await markStage(projectID, importID, "summarizing_title")
      const summary = await buildSummary({
        text: parsedText,
        sourceLabel: sourceLabel({
          mode: importTask.input.mode,
          fileName: importTask.input.file_name,
          url: canonicalURL || importTask.input.url,
        }),
      })
      const title = normalizeTitle(summary)
      const titleSlug = slugifyTitle(title)

      const docID = replaceDoc?.id ?? buildDocID(importID, title)
      const docPath = replaceDoc?.doc_path ?? `${docsRootLogical(projectID)}/${titleSlug}--${docID}.${fileExt}`
      const summaryPath = replaceDoc?.summary_path ?? `${summaryRootLogical(projectID)}/${titleSlug}--${docID}.md`

      await markStage(projectID, importID, "chunking")
      const chunks = chunkText({
        docID,
        text: parsedText,
      })

      await markStage(projectID, importID, "embedding")
      const embeddings = await embedChunks({
        chunks,
        requireRemoteEmbedding: pinecone.enabled,
      })

      await markStage(projectID, importID, "pinecone_upsert")
      const vectorIDs = embeddings.map((item) => item.id)
      await pinecone.upsert(projectID, embeddings.map((embedding, index) => ({
        id: embedding.id,
        values: embedding.values,
        metadata: {
          project_id: projectID,
          doc_id: docID,
          title,
          source_type: sourceType,
          source_path: docPath,
          chunk_index: chunks[index]?.index ?? index,
          import_id: importID,
          ...(canonicalURL ? { source_url: canonicalURL } : {}),
        },
      })))

      if (replaceDoc?.vector_ids && replaceDoc.vector_ids.length > 0) {
        const staleIDs = replaceDoc.vector_ids.filter((item) => !vectorIDs.includes(item))
        if (staleIDs.length > 0) {
          await pinecone.delete(projectID, staleIDs)
        }
      }

      await markStage(projectID, importID, "writing_summary")
      await writeWorkspaceFile({
        projectID,
        logicalPath: docPath,
        content: rawBytes,
        source: "external_upload",
      })

      const summaryMarkdown = renderSummaryMarkdown({
        title,
        tldr: summary.tldr.replace(/\s+/g, " ").trim(),
        keyPoints: normalizeSummaryItems(summary.keyPoints),
        evidencePoints: normalizeSummaryItems(summary.evidencePoints),
        source: canonicalURL || importTask.input.file_name || docPath,
      })
      await writeWorkspaceFile({
        projectID,
        logicalPath: summaryPath,
        content: summaryMarkdown,
        source: "external_upload",
      })

      const now = Date.now()
      await saveDoc({
        projectID,
        docID,
        sourceType,
        sourceURL: canonicalURL || undefined,
        fileExt,
        docPath,
        summaryPath,
        title,
        titleSlug,
        vectorIDs,
        chunkCount: chunks.length,
        status: "ready",
        createdAt: replaceDoc?.created_at ?? now,
        updatedAt: now,
      })

      await markStage(projectID, importID, "refresh_index")
      await refreshSummaryIndex(projectID)

      await markSuccess({
        projectID,
        importID,
        docID,
        docPath,
        summaryPath,
      })
    } catch (error) {
      const parsedError = asError(error)
      await markFail(projectID, importID, parsedError)
    } finally {
      if (payloadPath) {
        await fs.rm(payloadPath, { force: true }).catch(() => {})
      }
    }
  }

export function isPineconeEnabled() {
  return pinecone.enabled
}

export function buildIdempotencyFingerprint(input: {
  projectID: string
  mode: "file" | "url"
  source: string
  replaceDocID?: string
}) {
  return createHash("sha1")
    .update([input.projectID, input.mode, input.source, input.replaceDocID ?? ""].join("|"))
    .digest("hex")
}

export const LibraryImportService = {
  createImport,
  getImport,
  listDocs,
  getDoc,
  listPendingImports,
  processImport,
  isPineconeEnabled,
  buildIdempotencyFingerprint,
}
