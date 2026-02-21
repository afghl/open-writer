export const SEARCH_TOOL_IDS = [
  "pinecone_hybrid_search",
  "resolve_chunk_evidence",
  "rerank",
] as const

export type SearchToolID = (typeof SEARCH_TOOL_IDS)[number]
