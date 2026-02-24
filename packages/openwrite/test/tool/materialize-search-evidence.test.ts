import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const fetchCalls: Array<{ projectID: string; chunkIDs: string[] }> = []

mock.module("@/search", () => ({
  async fetchChunks(input: { projectID: string; chunkIDs: string[] }) {
    fetchCalls.push(input)
    return {
      chunks: [
        {
          chunk_id: "doc_alpha::0",
          doc_id: "doc_alpha",
          source_path: "inputs/library/docs/alpha.md",
          source_text_path: "projects/project-test-materialize/workspace/inputs/library/docs/text/alpha.txt",
          text: "Alpha evidence line 1\nAlpha evidence line 2",
          snippet: "Alpha evidence",
          hybrid_score: 0,
          metadata: {
            offset_start: 12,
            text_len: 48,
          },
        },
      ],
      missing_chunk_ids: ["doc_missing::9"],
    }
  },
}))

let namespaceRoot = ""
let prevNamespace = ""
let prevDataDir = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-materialize-evidence-tool-"))
  prevNamespace = process.env.OW_NAMESPACE ?? ""
  prevDataDir = process.env.OW_DATA_DIR ?? ""
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
})

beforeEach(() => {
  fetchCalls.length = 0
})

afterAll(async () => {
  process.env.OW_NAMESPACE = prevNamespace
  process.env.OW_DATA_DIR = prevDataDir
  mock.restore()
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("materialize_search_evidence replaces chunk placeholders with canonical evidence entries", async () => {
  const projectID = "project-test-materialize"
  const reportPath = "spec/research/search-reports/materialize.md"

  const { resolveWorkspacePath } = await import("../../src/util/workspace-path")
  const { resolvedPath } = resolveWorkspacePath(reportPath, projectID)
  await mkdir(path.dirname(resolvedPath), { recursive: true })
  await writeFile(resolvedPath, [
    "## 问题回顾和思考",
    "- note",
    "",
    "## 回答答案",
    "- statement",
    "",
    "## 证据原文",
    "- chunk_id: doc_alpha::0",
    "- chunk_id: doc_missing::9",
    "- chunk_id: doc_alpha::0",
  ].join("\n"), "utf8")

  const askCalls: Array<{ permission: string; patterns?: string[] }> = []
  const { MaterializeSearchEvidenceTool } = await import("../../src/tool/materialize-search-evidence")
  const tool = await MaterializeSearchEvidenceTool.init()
  const result = await tool.execute(
    {
      report_path: reportPath,
    },
    {
      sessionID: "session-1",
      messageID: "message-1",
      agent: "search",
      threadID: "thread-1",
      projectID,
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => { },
      ask: async (input: { permission: string; patterns?: string[] }) => {
        askCalls.push(input)
      },
    },
  )

  expect(askCalls[0]?.permission).toBe("edit")
  expect(fetchCalls).toEqual([
    {
      projectID,
      chunkIDs: ["doc_alpha::0", "doc_missing::9"],
    },
  ])

  const payload = JSON.parse(result.output) as {
    requested_chunk_ids: string[]
    materialized_count: number
    missing_chunk_ids: string[]
  }
  expect(payload.requested_chunk_ids).toEqual(["doc_alpha::0", "doc_missing::9"])
  expect(payload.materialized_count).toBe(1)
  expect(payload.missing_chunk_ids).toEqual(["doc_missing::9"])

  const updated = await readFile(resolvedPath, "utf8")
  expect(updated).toContain("### evidence_1")
  expect(updated).toContain("- chunk_id: doc_alpha::0")
  expect(updated).toContain("- source_path: inputs/library/docs/alpha.md")
  expect(updated).toContain("- offset_start: 12")
  expect(updated).toContain("- text_len: 48")
  expect(updated).toContain("> Alpha evidence line 1")
  expect(updated).toContain("> Alpha evidence line 2")
  expect(updated).toContain("### missing_chunk_ids")
  expect(updated).toContain("- doc_missing::9")
})
