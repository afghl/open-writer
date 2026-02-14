export const SEARCH_TOOL_IDS = [
  "search_candidates",
  "fetch_chunks",
  "rerank",
] as const

export type SearchToolID = (typeof SEARCH_TOOL_IDS)[number]
