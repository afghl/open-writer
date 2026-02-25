import { afterAll, beforeEach, expect, mock, test } from "bun:test"

const sparseInputs: string[] = []
const queryCalls: Array<{
  projectID: string
  values: number[]
  sparseValues?: unknown
  topK: number
  filter?: object
}> = []

const loadRetrievalModule = () => import("../../src/search/" + "retrieval?retrieval-doc-ids-keywords-test")

mock.module("@/vectorstore", () => {
  class MockPineconeService {
    enabled = true

    async query(input: {
      projectID: string
      values: number[]
      sparseValues?: unknown
      topK: number
      filter?: object
    }) {
      queryCalls.push(input)
      return [
        {
          id: "doc_a::0",
          score: 0.87,
          metadata: {
            chunk_id: "doc_a::0",
            doc_id: "doc_a",
            source_path: "projects/project-test/workspace/inputs/library/docs/a.md",
            source_text_path: "projects/project-test/workspace/inputs/library/docs/text/a.txt",
            offset_start: 0,
            text_len: 40,
            snippet: "alpha evidence",
          },
        },
      ]
    }

    async fetch() {
      return []
    }
  }

  return {
    PineconeService: MockPineconeService,
    sparseVectorFromText(input: string) {
      sparseInputs.push(input)
      return {
        indices: [1],
        values: [1],
      }
    },
  }
})

mock.module("@/llm", () => ({
  LLM: {
    for() {
      return {
        model: "text-embedding-3-large",
        async embedMany(input: { values: string[] }) {
          return {
            embeddings: input.values.map(() => [0.1, 0.2]),
          }
        },
      }
    },
  },
}))

beforeEach(() => {
  sparseInputs.length = 0
  queryCalls.length = 0
})

afterAll(() => {
  mock.restore()
})

test("searchCandidates uses keywords for sparse query and doc_ids for Pinecone filter", async () => {
  const { searchCandidates } = await loadRetrievalModule()
  const result = await searchCandidates({
    projectID: "project-test",
    query: "compare approaches",
    docIDs: ["doc_a", "doc_b"],
    keywords: ["vibe coding", "agentic engineering"],
    k: 5,
  })

  expect(sparseInputs).toEqual(["vibe coding agentic engineering"])
  expect(queryCalls).toHaveLength(1)
  expect(queryCalls[0]?.filter).toEqual({
    doc_id: {
      $in: ["doc_a", "doc_b"],
    },
  })
  expect(result.candidates).toHaveLength(1)
  expect(result.candidates[0]?.doc_id).toBe("doc_a")
})

test("searchCandidates does not set Pinecone filter when doc_ids are omitted", async () => {
  const { searchCandidates } = await loadRetrievalModule()
  await searchCandidates({
    projectID: "project-test",
    query: "compare approaches",
    keywords: ["vibe coding"],
    k: 5,
  })

  expect(queryCalls).toHaveLength(1)
  expect(queryCalls[0]?.filter).toBeUndefined()
})
