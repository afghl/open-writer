export const DEFAULT_SCOPE_PATHS = [
  "inputs/library/docs",
] as const

export const DEFAULT_SCOPE_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
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
  offset_start: number
  text_len: number
}

export type SearchChunk = {
  chunk_id: string
  doc_id: string
  source_path: string
  source_text_path: string
  text: string
  snippet: string
  hybrid_score: number
  metadata: ChunkMetadata
}

export type CandidateChunk = {
  chunk_id: string
  doc_id: string
  source_path: string
  source_text_path: string
  snippet: string
  hybrid_score: number
  rank: number
  metadata: ChunkMetadata
}

export type SearchStats = {
  backend: "pinecone_hybrid"
  candidate_hits: number
}

export type SearchResult = {
  candidates: CandidateChunk[]
  stats: SearchStats
}

export type RerankedEvidence = {
  rank: number
  chunk_id: string
  source_path: string
  relevance: number
  reason: string
  text: string
}

export type AtomicSearchStats = {
  backend: "pinecone_hybrid"
  candidate_hits: number
  retrieved_candidates: number
  resolved_chunks: number
  fallback: boolean
}

export type AtomicSearchResult = {
  query: string
  scope: SearchScope
  results: RerankedEvidence[]
  missing_chunk_ids: string[]
  stats: AtomicSearchStats
}
