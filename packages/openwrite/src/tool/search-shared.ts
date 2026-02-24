export const SEARCH_TOOL_IDS = [
  "pinecone_hybrid_search",
  "resolve_chunk_evidence",
  "materialize_search_evidence",
] as const

export type SearchToolID = (typeof SEARCH_TOOL_IDS)[number]
