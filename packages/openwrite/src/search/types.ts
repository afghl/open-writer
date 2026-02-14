export const DEFAULT_SCOPE_PATHS = [
  "inputs/library/docs",
  "inputs/library/summary/docs",
] as const

export const DEFAULT_SCOPE_EXTENSIONS = [
  ".md",
  ".txt",
  ".markdown",
  ".json",
] as const

export type SearchScope = {
  paths: string[]
  extensions: string[]
}

export type SearchScopeInput = {
  paths?: string[]
  extensions?: string[]
}

export type ChunkMetadata = {
  start_line: number
  end_line: number
  section: string
  offset_start: number
  offset_end: number
  page?: number
}

export type SearchChunk = {
  chunk_id: string
  source_path: string
  text: string
  snippet: string
  metadata: ChunkMetadata
}

export type CandidateChunk = {
  chunk_id: string
  source_path: string
  snippet: string
  bm25_score: number | null
  vector_score: number | null
  fused_score: number
  rank: number
  metadata: ChunkMetadata
}

export type SearchStats = {
  corpus_files: number
  corpus_chunks: number
  bm25_hits: number
  vector_hits: number
  used_bm25: boolean
  used_vector: boolean
  degraded_reason?: string
  skipped_files: number
}

export type SearchResult = {
  candidates: CandidateChunk[]
  stats: SearchStats
}
