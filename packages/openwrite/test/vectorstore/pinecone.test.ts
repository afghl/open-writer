import { afterAll, beforeEach, expect, mock, test } from "bun:test"

type UpsertCall = { records: unknown[] }
const upsertCalls: UpsertCall[] = []

mock.module("@pinecone-database/pinecone", () => {
  class MockPinecone {
    constructor(_config: { apiKey: string }) { }

    index(_indexName: string) {
      return {
        namespace(_projectID: string) {
          return {
            async upsert(input: UpsertCall) {
              upsertCalls.push(input)
            },
            async deleteMany() { },
            async query() {
              return { matches: [] }
            },
            async fetch() {
              return { records: {} }
            },
          }
        },
      }
    }
  }

  return {
    Pinecone: MockPinecone,
  }
})

const loadPineconeModule = () => import("../../src/vectorstore/" + "pinecone?pinecone-upsert-batch-test")

const prevPineconeAPIKey = process.env.PINECONE_API_KEY
const prevPineconeIndex = process.env.OW_PINECONE_INDEX

beforeEach(() => {
  upsertCalls.length = 0
  process.env.PINECONE_API_KEY = "pcsk_test"
  process.env.OW_PINECONE_INDEX = "openwrite-test-index"
})

afterAll(() => {
  mock.restore()
  if (prevPineconeAPIKey === undefined) {
    delete process.env.PINECONE_API_KEY
  } else {
    process.env.PINECONE_API_KEY = prevPineconeAPIKey
  }
  if (prevPineconeIndex === undefined) {
    delete process.env.OW_PINECONE_INDEX
  } else {
    process.env.OW_PINECONE_INDEX = prevPineconeIndex
  }
})

test("upsert splits records into multiple batches when request payload is too large", async () => {
  const { PineconeService } = await loadPineconeModule()
  const service = new PineconeService()

  const largeSnippet = "x".repeat(1_100_000)
  await service.upsert("project_batch", [
    {
      id: "v_1",
      values: [0.1],
      metadata: { snippet: largeSnippet, chunk_index: 0 },
    },
    {
      id: "v_2",
      values: [0.2],
      metadata: { snippet: largeSnippet, chunk_index: 1 },
    },
  ])

  expect(upsertCalls.length).toBe(2)
  expect(upsertCalls[0]?.records.length).toBe(1)
  expect(upsertCalls[1]?.records.length).toBe(1)
})

test("upsert keeps a single batch for small payloads", async () => {
  const { PineconeService } = await loadPineconeModule()
  const service = new PineconeService()

  await service.upsert("project_single_batch", [
    {
      id: "v_small_1",
      values: [0.1],
      metadata: { snippet: "one", chunk_index: 0 },
    },
    {
      id: "v_small_2",
      values: [0.2],
      metadata: { snippet: "two", chunk_index: 1 },
    },
    {
      id: "v_small_3",
      values: [0.3],
      metadata: { snippet: "three", chunk_index: 2 },
    },
  ])

  expect(upsertCalls.length).toBe(1)
  expect(upsertCalls[0]?.records.length).toBe(3)
})

test("upsert throws when a single record exceeds safe payload size", async () => {
  const { PineconeService } = await loadPineconeModule()
  const service = new PineconeService()

  const hugeSnippet = "x".repeat(2_100_000)
  await expect(service.upsert("project_oversize", [
    {
      id: "v_huge",
      values: [0.1],
      metadata: { snippet: hugeSnippet, chunk_index: 0 },
    },
  ])).rejects.toThrow("exceeds safe request size")
  expect(upsertCalls.length).toBe(0)
})
