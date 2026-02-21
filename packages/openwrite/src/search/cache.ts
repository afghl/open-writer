import { promises as fs } from "node:fs"
import path from "node:path"
import { resolveWorkspacePath } from "@/path"
import { PineconeService, sparseVectorFromText } from "@/vectorstore"
import { embedTexts } from "./vector"
import type { SearchChunk, SearchResult, SearchScope, SearchScopeInput } from "./types"
import { DEFAULT_SCOPE_EXTENSIONS, DEFAULT_SCOPE_PATHS } from "./types"

const pinecone = new PineconeService()

function normalizePosix(input: string) {
  return input.replace(/\\/g, "/")
}

function normalizeScopePath(input: string) {
  const normalized = normalizePosix(input).replace(/^\/+/, "").replace(/\/+$/, "")
  if (!normalized) {
    throw new Error("Scope path cannot be empty")
  }
  if (normalized.includes("..")) {
    throw new Error(`Scope path cannot include '..': ${input}`)
  }
  if (!(normalized === "inputs/library" || normalized.startsWith("inputs/library/"))) {
    throw new Error(`Scope path must stay under inputs/library: ${input}`)
  }
  return normalized
}

function normalizeExtension(input: string) {
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) {
    throw new Error("Scope extension cannot be empty")
  }
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`
}

export function normalizeScope(input?: SearchScopeInput): SearchScope {
  const paths = (input?.paths?.length ? input.paths : Array.from(DEFAULT_SCOPE_PATHS)).map(normalizeScopePath)
  const extensions = (
    input?.extensions?.length
      ? input.extensions
      : Array.from(DEFAULT_SCOPE_EXTENSIONS)
  ).map(normalizeExtension)

  return {
    paths: Array.from(new Set(paths)),
    extensions: Array.from(new Set(extensions)),
  }
}

function extensionOf(filePath: string) {
  return path.extname(filePath).toLowerCase()
}

function pathInScope(sourcePath: string, scopePaths: string[]) {
  return scopePaths.some((prefix) => sourcePath === prefix || sourcePath.startsWith(`${prefix}/`))
}

function readMetadataString(metadata: Record<string, string | number | boolean>, key: string) {
  const raw = metadata[key]
  return typeof raw === "string" ? raw : ""
}

function readMetadataNumber(metadata: Record<string, string | number | boolean>, key: string) {
  const raw = metadata[key]
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw
  }
  if (typeof raw === "string") {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

function toWorkspaceRelativePath(sourcePath: string, projectID: string) {
  const normalized = sourcePath.replace(/^\/+/, "")
  const prefix = `projects/${projectID}/workspace/`
  if (normalized.startsWith(prefix)) {
    return normalized.slice(prefix.length)
  }
  return normalized
}

function parseSearchCandidate(input: {
  projectID: string
  id: string
  score: number
  metadata: Record<string, string | number | boolean>
}) {
  const chunkID = readMetadataString(input.metadata, "chunk_id") || input.id
  const docID = readMetadataString(input.metadata, "doc_id")
  const sourcePathRaw = readMetadataString(input.metadata, "source_path")
  const sourceTextPath = readMetadataString(input.metadata, "source_text_path")
  const offsetStart = readMetadataNumber(input.metadata, "offset_start")
  const textLen = readMetadataNumber(input.metadata, "text_len")

  if (!docID || !sourcePathRaw || !sourceTextPath || offsetStart === undefined || textLen === undefined) {
    return undefined
  }

  const sourcePath = toWorkspaceRelativePath(sourcePathRaw, input.projectID)
  const snippet = readMetadataString(input.metadata, "snippet") || `chunk ${chunkID}`

  return {
    chunk_id: chunkID,
    doc_id: docID,
    source_path: sourcePath,
    source_text_path: sourceTextPath,
    snippet,
    hybrid_score: input.score,
    metadata: {
      offset_start: Math.max(0, Math.floor(offsetStart)),
      text_len: Math.max(0, Math.floor(textLen)),
    },
  }
}

function isParsedCandidate(
  value: ReturnType<typeof parseSearchCandidate>,
): value is NonNullable<ReturnType<typeof parseSearchCandidate>> {
  return !!value
}

export async function searchCandidates(input: {
  projectID: string
  query: string
  scope?: SearchScopeInput
  k?: number
  signal?: AbortSignal
}): Promise<SearchResult> {
  const scope = normalizeScope(input.scope)
  const k = Math.max(1, Math.min(50, input.k ?? 20))

  if (!pinecone.enabled) {
    throw new Error("Pinecone is not configured")
  }

  const [queryVector] = await embedTexts({
    texts: [input.query],
    signal: input.signal,
  })

  const sparseVector = sparseVectorFromText(input.query)
  const overfetch = Math.max(k * 4, k)
  const matches = await pinecone.query({
    projectID: input.projectID,
    values: queryVector,
    sparseValues: sparseVector,
    topK: overfetch,
  })

  const candidates = matches
    .map((match) => parseSearchCandidate({
      projectID: input.projectID,
      id: match.id,
      score: match.score,
      metadata: match.metadata,
    }))
    .filter(isParsedCandidate)
    .filter((candidate) => {
      return (
        pathInScope(candidate.source_path, scope.paths)
        && scope.extensions.includes(extensionOf(candidate.source_path))
      )
    })
    .slice(0, k)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }))

  return {
    candidates,
    stats: {
      backend: "pinecone_hybrid",
      candidate_hits: matches.length,
    },
  }
}

function clipSlice(content: string, start: number, len: number) {
  const safeStart = Math.max(0, Math.min(content.length, start))
  const safeEnd = Math.max(safeStart, Math.min(content.length, safeStart + Math.max(0, len)))
  return content.slice(safeStart, safeEnd)
}

export async function fetchChunks(input: {
  projectID: string
  chunkIDs: string[]
}) {
  if (!pinecone.enabled) {
    throw new Error("Pinecone is not configured")
  }

  const records = await pinecone.fetch(input.projectID, input.chunkIDs)
  const byID = new Map(records.map((record) => [record.id, record]))
  const textCache = new Map<string, string>()

  const chunks: SearchChunk[] = []
  const missingChunkIDs: string[] = []

  for (const chunkID of input.chunkIDs) {
    const record = byID.get(chunkID)
    if (!record) {
      missingChunkIDs.push(chunkID)
      continue
    }

    const parsed = parseSearchCandidate({
      projectID: input.projectID,
      id: record.id,
      score: 0,
      metadata: record.metadata,
    })

    if (!parsed) {
      missingChunkIDs.push(chunkID)
      continue
    }

    let text = textCache.get(parsed.source_text_path)
    if (!text) {
      try {
        const { resolvedPath } = resolveWorkspacePath(parsed.source_text_path, input.projectID)
        text = await fs.readFile(resolvedPath, "utf8")
        textCache.set(parsed.source_text_path, text)
      } catch {
        missingChunkIDs.push(chunkID)
        continue
      }
    }

    const chunkText = clipSlice(text, parsed.metadata.offset_start, parsed.metadata.text_len)
    chunks.push({
      ...parsed,
      text: chunkText,
      snippet: parsed.snippet,
      hybrid_score: 0,
    })
  }

  return {
    chunks,
    missing_chunk_ids: missingChunkIDs,
  }
}

export function resetSearchCache() {
  return
}
