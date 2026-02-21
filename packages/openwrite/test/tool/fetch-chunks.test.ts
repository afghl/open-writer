import { afterAll, expect, mock, test } from "bun:test"

const fetchCalls: Array<{ projectID: string; chunkIDs: string[] }> = []

mock.module("@/search", () => ({
  normalizeScope(input?: { paths?: string[]; extensions?: string[] }) {
    return {
      paths: input?.paths ?? ["inputs/library/docs"],
      extensions: input?.extensions ?? [".pdf", ".txt"],
    }
  },
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

test("resolve_chunk_evidence returns requested chunks in order", async () => {
  const { ResolveChunkEvidenceTool } = await import("../../src/tool/fetch-chunks")

  const tool = await ResolveChunkEvidenceTool.init()
  const result = await tool.execute(
    {
      chunk_ids: ["doc_abc::1", "doc_abc::0"],
    },
    {
      sessionID: "session-1",
      messageID: "message-1",
      agent: "search",
      threadID: "thread-1",
      projectID: "project-test-fetch-chunks",
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => {},
      ask: async () => {},
    },
  )

  const parsed = JSON.parse(result.output) as {
    chunks: Array<{ chunk_id: string; text: string; source_path: string }>
    missing_chunk_ids: string[]
  }

  expect(fetchCalls).toEqual([
    {
      projectID: "project-test-fetch-chunks",
      chunkIDs: ["doc_abc::1", "doc_abc::0"],
    },
  ])
  expect(parsed.missing_chunk_ids).toEqual([])
  expect(parsed.chunks).toHaveLength(2)
  expect(parsed.chunks[0]?.chunk_id).toBe("doc_abc::1")
  expect(parsed.chunks[1]?.chunk_id).toBe("doc_abc::0")
  expect(parsed.chunks[0]?.source_path).toContain("inputs/library/docs/example.pdf")
})
