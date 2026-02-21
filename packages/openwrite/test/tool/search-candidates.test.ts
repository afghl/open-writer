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

test("pinecone_hybrid_search returns ranked candidates", async () => {
  const { PineconeHybridSearchTool } = await import("../../src/tool/search-candidates")

  const askCalls: unknown[] = []
  const tool = await PineconeHybridSearchTool.init()
  const result = await tool.execute(
    {
      query: "hybrid retrieval",
      k: 5,
    },
    {
      sessionID: "session-1",
      messageID: "message-1",
      agent: "search",
      threadID: "thread-1",
      projectID: "project-test-search-candidates",
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => {},
      ask: async (input) => {
        askCalls.push(input)
      },
    },
  )

  const parsed = JSON.parse(result.output) as {
    candidates: Array<{ chunk_id: string; source_path: string; hybrid_score: number }>
    stats: { backend: string; candidate_hits: number }
  }

  expect(askCalls.length).toBe(1)
  expect(searchCalls.length).toBe(1)
  expect(parsed.stats.backend).toBe("pinecone_hybrid")
  expect(parsed.stats.candidate_hits).toBe(1)
  expect(parsed.candidates[0]?.chunk_id).toBe("doc_abc::0")
  expect(parsed.candidates[0]?.source_path).toBe("inputs/library/docs/example.pdf")
  expect(parsed.candidates[0]?.hybrid_score).toBe(0.91)
})
