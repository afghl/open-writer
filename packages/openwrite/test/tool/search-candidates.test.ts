import { afterAll, expect, mock, test } from "bun:test"

const searchCalls: Array<{
  projectID: string
  query: string
  scope: { paths: string[]; extensions: string[] }
  k?: number
}> = []

mock.module("@/search", () => ({
  normalizeScope(input?: { paths?: string[]; extensions?: string[] }) {
    return {
      paths: input?.paths ?? ["inputs/library/docs"],
      extensions: input?.extensions ?? [".pdf", ".txt"],
    }
  },
  async searchCandidates(input: {
    projectID: string
    query: string
    scope: { paths: string[]; extensions: string[] }
    k?: number
  }) {
    searchCalls.push(input)
    return {
      candidates: [
        {
          chunk_id: "doc_abc::0",
          doc_id: "doc_abc",
          source_path: "inputs/library/docs/example.pdf",
          source_text_path: "projects/project-test-search-candidates/workspace/inputs/library/docs/text/example--doc_abc.txt",
          snippet: "Example chunk",
          hybrid_score: 0.91,
          rank: 1,
          metadata: {
            offset_start: 0,
            text_len: 120,
          },
        },
      ],
      stats: {
        backend: "pinecone_hybrid",
        candidate_hits: 1,
      },
    }
  },
  async fetchChunks() {
    return {
      chunks: [],
      missing_chunk_ids: [],
    }
  },
}))

afterAll(() => {
  mock.restore()
})

