import { afterAll, expect, mock, test } from "bun:test"

const fetchCalls: Array<{ projectID: string; chunkIDs: string[] }> = []

mock.module("@/search", () => ({
  async searchCandidates() {
    return {
      candidates: [],
      stats: {
        backend: "pinecone_hybrid",
        candidate_hits: 0,
      },
    }
  },
  async fetchChunks(input: { projectID: string; chunkIDs: string[] }) {
    fetchCalls.push(input)
    return {
      chunks: input.chunkIDs.map((chunkID, index) => ({
        chunk_id: chunkID,
        doc_id: "doc_abc",
        source_path: "inputs/library/docs/example.pdf",
        source_text_path: "projects/project-test-fetch-chunks/workspace/inputs/library/docs/text/example--doc_abc.txt",
        text: `chunk-text-${index}`,
        snippet: `chunk-text-${index}`,
        hybrid_score: 0,
        metadata: {
          offset_start: index * 100,
          text_len: 80,
        },
      })),
      missing_chunk_ids: [],
    }
  },
}))

afterAll(() => {
  mock.restore()
})
