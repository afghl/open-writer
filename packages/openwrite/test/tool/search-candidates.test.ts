import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const projectID = "project-test-search-candidates"
let namespaceRoot = ""
let prevNamespace = ""
let prevDataDir = ""
let prevAPIKey = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-search-candidates-"))
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

test("search_candidates returns ranked candidates and degrades vector when key missing", async () => {
  const { projectWorkspaceRoot } = await import("../../src/path/workspace")
  const { SearchCandidatesTool } = await import("../../src/tool/search-candidates")
  const { resetSearchCache } = await import("../../src/search/cache")

  resetSearchCache()

  const root = projectWorkspaceRoot(projectID)
  const docsDir = path.join(root, "inputs", "library", "docs")
  await mkdir(docsDir, { recursive: true })
  await writeFile(
    path.join(docsDir, "retrieval.md"),
    "# Agentic Search\nAgentic search mixes BM25 and semantic retrieval for better evidence grounding.",
    "utf8",
  )

  const tool = await SearchCandidatesTool.init()
  const result = await tool.execute(
    {
      query: "agentic semantic retrieval",
      k: 5,
    },
    {
      sessionID: "session-1",
      messageID: "message-1",
      agent: "search",
      threadID: "thread-1",
      projectID,
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => {},
      ask: async () => {},
    },
  )

  const parsed = JSON.parse(result.output) as {
    candidates: Array<{ source_path: string; chunk_id: string }>
    stats: { used_vector: boolean; used_bm25: boolean; corpus_chunks: number }
  }

  expect(parsed.stats.used_bm25).toBe(true)
  expect(parsed.stats.used_vector).toBe(false)
  expect(parsed.stats.corpus_chunks).toBeGreaterThan(0)
  expect(parsed.candidates.length).toBeGreaterThan(0)
  expect(parsed.candidates[0]?.source_path).toContain("inputs/library/docs/retrieval.md")
  expect(parsed.candidates[0]?.chunk_id).toContain("retrieval.md")
})
