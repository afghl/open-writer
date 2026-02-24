import { afterAll, beforeEach, expect, mock, test } from "bun:test"

const searchCalls: Array<{
  projectID: string
  query: string
  scope: { paths: string[]; extensions: string[] }
  k?: number
}> = []

const fetchCalls: Array<{
  projectID: string
  chunkIDs: string[]
}> = []

const rerankCalls: Array<{
  query: string
  topK: number
  signal?: AbortSignal
}> = []

const askCalls: Array<{
  permission: string
  patterns?: string[]
}> = []

let rerankFallback = false
let fetchMissingChunkIDs: string[] = []
let rerankMissingChunkIDs: string[] = []

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
          source_path: "inputs/library/docs/example-a.pdf",
          source_text_path: "projects/project-test-search-candidates/workspace/inputs/library/docs/text/example-a.txt",
          snippet: "Evidence A",
          hybrid_score: 0.91,
          rank: 1,
          metadata: {
            offset_start: 0,
            text_len: 120,
          },
        },
        {
          chunk_id: "doc_abc::1",
          doc_id: "doc_abc",
          source_path: "inputs/library/docs/example-b.pdf",
          source_text_path: "projects/project-test-search-candidates/workspace/inputs/library/docs/text/example-b.txt",
          snippet: "Evidence B",
          hybrid_score: 0.83,
          rank: 2,
          metadata: {
            offset_start: 120,
            text_len: 90,
          },
        },
      ],
      stats: {
        backend: "pinecone_hybrid" as const,
        candidate_hits: 12,
      },
    }
  },
  async fetchChunks(input: { projectID: string; chunkIDs: string[] }) {
    fetchCalls.push(input)
    return {
      chunks: [
        {
          chunk_id: "doc_abc::0",
          doc_id: "doc_abc",
          source_path: "inputs/library/docs/example-a.pdf",
          source_text_path: "projects/project-test-search-candidates/workspace/inputs/library/docs/text/example-a.txt",
          text: "Evidence text A",
          snippet: "Evidence A",
          hybrid_score: 0,
          metadata: {
            offset_start: 0,
            text_len: 120,
          },
        },
      ],
      missing_chunk_ids: fetchMissingChunkIDs,
    }
  },
  async rerankEvidence(input: {
    query: string
    topK: number
    signal?: AbortSignal
  }) {
    rerankCalls.push(input)
    return {
      results: [
        {
          rank: 1,
          chunk_id: "doc_abc::0",
          source_path: "inputs/library/docs/example-a.pdf",
          relevance: 0.87,
          reason: "Directly addresses the query.",
          text: "Evidence text A",
        },
      ],
      missing_chunk_ids: rerankMissingChunkIDs,
      fallback: rerankFallback,
    }
  },
}))

beforeEach(() => {
  searchCalls.length = 0
  fetchCalls.length = 0
  rerankCalls.length = 0
  askCalls.length = 0
  rerankFallback = false
  fetchMissingChunkIDs = []
  rerankMissingChunkIDs = []
})

afterAll(() => {
  mock.restore()
})

test("pinecone_hybrid_search runs retrieve->fetch->rerank and returns atomic results", async () => {
  fetchMissingChunkIDs = ["doc_abc::1"]
  rerankMissingChunkIDs = ["doc_abc::2", "doc_abc::1"]

  const { PineconeHybridSearchTool } = await import("../../src/tool/search-candidates")
  const tool = await PineconeHybridSearchTool.init()
  const result = await tool.execute(
    {
      query: "find evidence",
      scope: {
        paths: ["inputs/library/docs"],
        extensions: [".pdf"],
      },
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
      ask: async (input: { permission: string; patterns?: string[] }) => {
        askCalls.push({
          permission: input.permission,
          patterns: input.patterns,
        })
      },
    },
  )

  expect(searchCalls).toHaveLength(1)
  expect(searchCalls[0]?.k).toBe(15)
  expect(fetchCalls).toHaveLength(1)
  expect(fetchCalls[0]?.chunkIDs).toEqual(["doc_abc::0", "doc_abc::1"])
  expect(rerankCalls).toHaveLength(1)
  expect(rerankCalls[0]?.topK).toBe(10)
  expect(askCalls[0]?.permission).toBe("read")
  expect(askCalls[0]?.patterns).toEqual(["inputs/library/docs"])

  const parsed = JSON.parse(result.output) as {
    query: string
    results: Array<{ chunk_id: string; text: string }>
    missing_chunk_ids: string[]
    stats: {
      candidate_hits: number
      retrieved_candidates: number
      resolved_chunks: number
      fallback: boolean
    }
  }

  expect(parsed.query).toBe("find evidence")
  expect(parsed.results).toHaveLength(1)
  expect(parsed.results[0]?.chunk_id).toBe("doc_abc::0")
  expect(parsed.results[0]?.text).toBe("Evidence text A")
  expect(parsed.missing_chunk_ids).toEqual(["doc_abc::1", "doc_abc::2"])
  expect(parsed.stats.candidate_hits).toBe(12)
  expect(parsed.stats.retrieved_candidates).toBe(2)
  expect(parsed.stats.resolved_chunks).toBe(1)
  expect(parsed.stats.fallback).toBe(false)
})

test("pinecone_hybrid_search uses fixed retrieve/topK and keeps fallback flag", async () => {
  rerankFallback = true

  const { PineconeHybridSearchTool } = await import("../../src/tool/search-candidates")
  const tool = await PineconeHybridSearchTool.init()
  const result = await tool.execute(
    {
      query: "find evidence",
    },
    {
      sessionID: "session-2",
      messageID: "message-2",
      agent: "search",
      threadID: "thread-2",
      projectID: "project-test-search-candidates",
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => {},
      ask: async () => {},
    },
  )

  expect(searchCalls).toHaveLength(1)
  expect(searchCalls[0]?.k).toBe(15)
  expect(rerankCalls).toHaveLength(1)
  expect(rerankCalls[0]?.topK).toBe(10)

  const parsed = JSON.parse(result.output) as {
    stats: {
      fallback: boolean
    }
  }
  expect(parsed.stats.fallback).toBe(true)
})
