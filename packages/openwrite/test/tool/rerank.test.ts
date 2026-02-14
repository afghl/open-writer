import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""
let prevNamespace = ""
let prevDataDir = ""
let prevAPIKey = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-rerank-"))
  prevNamespace = process.env.OW_NAMESPACE ?? ""
  prevDataDir = process.env.OW_DATA_DIR ?? ""
  prevAPIKey = process.env.OPENAI_API_KEY ?? ""

  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
  process.env.OPENAI_API_KEY = ""
})

afterAll(async () => {
  process.env.OW_NAMESPACE = prevNamespace
  process.env.OW_DATA_DIR = prevDataDir
  process.env.OPENAI_API_KEY = prevAPIKey

  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("rerank falls back to fused score ordering when LLM is unavailable", async () => {
  const { RerankTool } = await import("../../src/tool/rerank")

  const tool = await RerankTool.init()
  const result = await tool.execute(
    {
      query: "best evidence",
      candidates: [
        {
          chunk_id: "c-low",
          source_path: "inputs/library/docs/a.md",
          snippet: "low confidence",
          fused_score: 0.02,
          metadata: {},
        },
        {
          chunk_id: "c-high",
          source_path: "inputs/library/docs/b.md",
          snippet: "high confidence",
          fused_score: 0.09,
          metadata: {},
        },
      ],
      k: 2,
    },
    {
      sessionID: "session-1",
      messageID: "message-1",
      agent: "search",
      runID: "run-1",
      projectID: "project-1",
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => {},
      ask: async () => {},
    },
  )

  const parsed = JSON.parse(result.output) as {
    fallback: boolean
    results: Array<{ chunk_id: string; rank: number }>
  }

  expect(parsed.fallback).toBe(true)
  expect(parsed.results).toHaveLength(2)
  expect(parsed.results[0]?.chunk_id).toBe("c-high")
  expect(parsed.results[0]?.rank).toBe(1)
  expect(parsed.results[1]?.chunk_id).toBe("c-low")
})
