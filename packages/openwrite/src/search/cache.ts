import { promises as fs } from "node:fs"
import path from "node:path"
import { toPosixPath, trimPosixSlashes } from "@/util/path-format"
import { logicalWorkspacePath, resolveWorkspacePath } from "@/util/workspace-path"
import { BM25Index } from "./bm25"
import { chunkDocument } from "./chunker"
import { rrfFuse } from "./fusion"
import { tokenize } from "./tokenizer"
import type { SearchChunk, SearchResult, SearchScope, SearchScopeInput } from "./types"
import { DEFAULT_SCOPE_EXTENSIONS, DEFAULT_SCOPE_PATHS } from "./types"
import { cosineSimilarity, embedTexts } from "./vector"

const MAX_FILE_BYTES = 2 * 1024 * 1024
const BM25_LIMIT = 50
const VECTOR_LIMIT = 50

const LIBRARY_ROOT = "inputs/library"

type FileEntry = {
  sourcePath: string
  resolvedPath: string
  size: number
  mtimeMs: number
}

type IndexedFile = {
  sourcePath: string
  size: number
  mtimeMs: number
  chunks: SearchChunk[]
}

type CorpusIndex = {
  projectID: string
  files: Map<string, IndexedFile>
  chunks: SearchChunk[]
  chunkByID: Map<string, SearchChunk>
  bm25: BM25Index
  vectors: Map<string, number[]>
  skippedFiles: number
}

const cache = new Map<string, CorpusIndex>()

function normalizeScopePath(input: string) {
  const normalized = trimPosixSlashes(input)
  if (!normalized) {
    throw new Error("Scope path cannot be empty")
  }
  if (normalized.includes("..")) {
    throw new Error(`Scope path cannot include '..': ${input}`)
  }
  if (!(normalized === LIBRARY_ROOT || normalized.startsWith(`${LIBRARY_ROOT}/`))) {
    throw new Error(`Scope path must stay under ${LIBRARY_ROOT}: ${input}`)
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

async function walkFiles(root: string) {
  const result: string[] = []
  const stack = [root]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(absolute)
        continue
      }
      if (entry.isFile()) {
        result.push(absolute)
      }
    }
  }

  return result
}

function isLikelyBinary(content: Buffer) {
  const sample = content.subarray(0, Math.min(content.length, 8000))
  for (const byte of sample) {
    if (byte === 0) return true
  }
  return false
}

async function listLibraryFiles(projectID: string) {
  const logical = logicalWorkspacePath(projectID, LIBRARY_ROOT)
  const { resolvedPath, workspaceRoot } = resolveWorkspacePath(logical, projectID)

  const entries = await walkFiles(resolvedPath)

  const result: FileEntry[] = []
  for (const resolvedPath of entries) {
    const stat = await fs.stat(resolvedPath).catch(() => undefined)
    if (!stat || !stat.isFile()) continue

    const relative = toPosixPath(path.relative(workspaceRoot, resolvedPath))
    if (!(relative === LIBRARY_ROOT || relative.startsWith(`${LIBRARY_ROOT}/`))) {
      continue
    }

    result.push({
      sourcePath: relative,
      resolvedPath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    })
  }

  result.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))
  return result
}

function extensionOf(filePath: string) {
  return path.extname(filePath).toLowerCase()
}

function pathInScope(sourcePath: string, scopePaths: string[]) {
  return scopePaths.some((prefix) => sourcePath === prefix || sourcePath.startsWith(`${prefix}/`))
}

async function buildFileChunks(entry: FileEntry) {
  if (entry.size > MAX_FILE_BYTES) {
    return {
      chunks: [] as SearchChunk[],
      skipped: true,
    }
  }

  const raw = await fs.readFile(entry.resolvedPath)
  if (isLikelyBinary(raw)) {
    return {
      chunks: [] as SearchChunk[],
      skipped: true,
    }
  }

  const content = raw.toString("utf8")
  return {
    chunks: chunkDocument({
      sourcePath: entry.sourcePath,
      content,
    }),
    skipped: false,
  }
}

async function syncProjectIndex(projectID: string) {
  const previous = cache.get(projectID)
  const vectors = previous ? new Map(previous.vectors) : new Map<string, number[]>()

  const nextFiles = new Map<string, IndexedFile>()
  const libraryFiles = await listLibraryFiles(projectID)

  let skippedFiles = 0
  for (const entry of libraryFiles) {
    const old = previous?.files.get(entry.sourcePath)
    if (old && old.size === entry.size && old.mtimeMs === entry.mtimeMs) {
      nextFiles.set(entry.sourcePath, old)
      continue
    }

    const built = await buildFileChunks(entry)
    if (built.skipped) {
      skippedFiles += 1
    }

    nextFiles.set(entry.sourcePath, {
      sourcePath: entry.sourcePath,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      chunks: built.chunks,
    })
  }

  const chunks = Array.from(nextFiles.values())
    .flatMap((file) => file.chunks)
    .sort((a, b) => {
      const byPath = a.source_path.localeCompare(b.source_path)
      if (byPath !== 0) return byPath
      return a.metadata.offset_start - b.metadata.offset_start
    })

  const chunkByID = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]))
  const activeChunkIDs = new Set(chunkByID.keys())
  for (const chunkID of Array.from(vectors.keys())) {
    if (!activeChunkIDs.has(chunkID)) {
      vectors.delete(chunkID)
    }
  }

  const bm25 = new BM25Index(
    chunks.map((chunk) => ({
      chunk_id: chunk.chunk_id,
      tokens: tokenize(chunk.text),
    })),
  )

  const index: CorpusIndex = {
    projectID,
    files: nextFiles,
    chunks,
    chunkByID,
    bm25,
    vectors,
    skippedFiles,
  }

  cache.set(projectID, index)
  return index
}

async function ensureEmbeddings(index: CorpusIndex, chunks: SearchChunk[], signal?: AbortSignal) {
  const missing = chunks.filter((chunk) => !index.vectors.has(chunk.chunk_id))
  if (missing.length === 0) {
    return
  }

  const vectors = await embedTexts({
    texts: missing.map((chunk) => chunk.text),
    signal,
  })

  for (let i = 0; i < missing.length; i += 1) {
    const chunk = missing[i]
    const vector = vectors[i]
    if (vector) {
      index.vectors.set(chunk.chunk_id, vector)
    }
  }
}

function fallbackReason(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return String(error)
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

  const corpusIndex = await syncProjectIndex(input.projectID)
  const scopedChunks = corpusIndex.chunks.filter(
    (chunk) =>
      pathInScope(chunk.source_path, scope.paths)
      && scope.extensions.includes(extensionOf(chunk.source_path)),
  )

  const scopedChunkIDs = new Set(scopedChunks.map((chunk) => chunk.chunk_id))
  const scopedFileCount = new Set(scopedChunks.map((chunk) => chunk.source_path)).size

  const bm25Hits = corpusIndex.bm25.search(tokenize(input.query), BM25_LIMIT, scopedChunkIDs)

  let vectorHits: Array<{ chunk_id: string; score: number; rank: number }> = []
  let usedVector = true
  let degradedReason: string | undefined

  try {
    if (scopedChunks.length > 0) {
      const [queryVector] = await embedTexts({
        texts: [input.query],
        signal: input.signal,
      })
      await ensureEmbeddings(corpusIndex, scopedChunks, input.signal)

      vectorHits = scopedChunks
        .map((chunk) => {
          const chunkVector = corpusIndex.vectors.get(chunk.chunk_id)
          if (!chunkVector) {
            return undefined
          }
          return {
            chunk_id: chunk.chunk_id,
            score: cosineSimilarity(queryVector, chunkVector),
          }
        })
        .filter((item): item is { chunk_id: string; score: number } => !!item)
        .sort((a, b) => b.score - a.score)
        .slice(0, VECTOR_LIMIT)
        .map((item, index) => ({
          ...item,
          rank: index + 1,
        }))
    }
  } catch (error) {
    usedVector = false
    degradedReason = fallbackReason(error)
    vectorHits = []
  }

  const fused = rrfFuse({
    bm25: bm25Hits,
    vector: vectorHits,
  })

  const candidates = fused
    .slice(0, k)
    .map((item, rankIndex) => {
      const chunk = indexByIDOrThrow(corpusIndex.chunkByID, item.chunk_id)
      return {
        chunk_id: chunk.chunk_id,
        source_path: chunk.source_path,
        snippet: chunk.snippet,
        bm25_score: item.bm25_score,
        vector_score: item.vector_score,
        fused_score: item.fused_score,
        rank: rankIndex + 1,
        metadata: chunk.metadata,
      }
    })

  return {
    candidates,
    stats: {
      corpus_files: scopedFileCount,
      corpus_chunks: scopedChunks.length,
      bm25_hits: bm25Hits.length,
      vector_hits: vectorHits.length,
      used_bm25: true,
      used_vector: usedVector,
      degraded_reason: degradedReason,
      skipped_files: corpusIndex.skippedFiles,
    },
  }
}

function indexByIDOrThrow(chunkByID: Map<string, SearchChunk>, chunkID: string) {
  const chunk = chunkByID.get(chunkID)
  if (!chunk) {
    throw new Error(`Chunk not found: ${chunkID}`)
  }
  return chunk
}

export async function fetchChunks(input: {
  projectID: string
  chunkIDs: string[]
}) {
  const index = await syncProjectIndex(input.projectID)

  const chunks: SearchChunk[] = []
  const missingChunkIDs: string[] = []

  for (const chunkID of input.chunkIDs) {
    const chunk = index.chunkByID.get(chunkID)
    if (!chunk) {
      missingChunkIDs.push(chunkID)
      continue
    }
    chunks.push(chunk)
  }

  return {
    chunks,
    missing_chunk_ids: missingChunkIDs,
  }
}

export function resetSearchCache() {
  cache.clear()
}
