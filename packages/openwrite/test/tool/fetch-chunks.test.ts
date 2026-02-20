import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const projectID = "project-test-fetch-chunks"
let namespaceRoot = ""
let prevNamespace = ""
let prevDataDir = ""
let prevAPIKey = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-fetch-chunks-"))
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

test("fetch_chunks returns requested chunks and preserves order", async () => {
  const { projectWorkspaceRoot } = await import("../../src/util/workspace-path")
  const { SearchCandidatesTool } = await import("../../src/tool/search-candidates")
  const { FetchChunksTool } = await import("../../src/tool/fetch-chunks")
  const { resetSearchCache } = await import("../../src/search/cache")

  resetSearchCache()

  const root = projectWorkspaceRoot(projectID)
  const docsDir = path.join(root, "inputs", "library", "docs")
  await mkdir(docsDir, { recursive: true })
  await writeFile(
    path.join(docsDir, "doc.md"),
    "First paragraph about retrieval.\n\nSecond paragraph contains chunk fetch validation.",
    "utf8",
  )

  const context = {
    sessionID: "session-1",
    messageID: "message-1",
    agent: "search",
    threadID: "thread-1",
    projectID,
    abort: new AbortController().signal,
    messages: [],
    metadata: async () => {},
    ask: async () => {},
  }

  const searchTool = await SearchCandidatesTool.init()
  const searchResult = await searchTool.execute(
    {
      query: "chunk fetch validation",
      k: 2,
    },
    context,
  )
  const parsedSearch = JSON.parse(searchResult.output) as {
    candidates: Array<{ chunk_id: string }>
  }

  expect(parsedSearch.candidates.length).toBeGreaterThan(0)
  const chunkID = parsedSearch.candidates[0]?.chunk_id
  expect(chunkID).toBeTruthy()

  const fetchTool = await FetchChunksTool.init()
  const fetchResult = await fetchTool.execute(
    {
      chunk_ids: [chunkID],
    },
    context,
  )

  const parsedFetch = JSON.parse(fetchResult.output) as {
    chunks: Array<{ chunk_id: string; text: string; source_path: string }>
    missing_chunk_ids: string[]
  }

  expect(parsedFetch.missing_chunk_ids).toEqual([])
  expect(parsedFetch.chunks).toHaveLength(1)
  expect(parsedFetch.chunks[0]?.chunk_id).toBe(chunkID)
  expect(parsedFetch.chunks[0]?.source_path).toContain("inputs/library/docs/doc.md")
  expect(parsedFetch.chunks[0]?.text).toContain("chunk fetch validation")
})
