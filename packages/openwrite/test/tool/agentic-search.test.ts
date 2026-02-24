import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import z from "zod"

type PromptCall = {
  sessionID: string
  text: string
  agent?: string
  skipTitleGeneration?: boolean
}

const promptCalls: PromptCall[] = []
const loadAgenticSearchModule = () => import("../../src/tool/" + "agentic-search?agentic-search-test")
let forcedReportPath: string | undefined

function parseReportPath(text: string) {
  const match = text.match(/^\s*report_path\s*:\s*(.+)$/im)
  return match?.[1]?.trim()
}

mock.module("@/session/prompt", () => ({
  PromptInput: z.any(),
  SessionPrompt: {
    assertNotBusy() {
      return
    },
    cancel() {
      return
    },
    async prompt(input: PromptCall) {
      promptCalls.push(input)
      const requestedReportPath = parseReportPath(input.text)
      const returnedReportPath = forcedReportPath ?? requestedReportPath ?? "spec/research/search-reports/fallback.md"
      return {
        info: {
          id: "message_assistant_search_tool",
          role: "assistant",
          sessionID: input.sessionID,
          parentID: "message_user_search_tool",
          agent: "search",
          thread_id: "thread-search",
          finish: "stop",
          time: {
            created: Date.now(),
            completed: Date.now(),
          },
        },
        parts: [
          {
            id: "part_text_1",
            type: "text",
            sessionID: input.sessionID,
            messageID: "message_assistant_search_tool",
            text: `REPORT_PATH: ${returnedReportPath}`,
          },
        ],
      }
    },
  },
}))

let namespaceRoot = ""
let projectID = ""
let prevNamespace = ""
let prevDataDir = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-agentic-search-tool-"))
  prevNamespace = process.env.OW_NAMESPACE ?? ""
  prevDataDir = process.env.OW_DATA_DIR ?? ""
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
  projectID = "project-test-agentic-search"
})

beforeEach(() => {
  promptCalls.length = 0
  forcedReportPath = undefined
})

afterAll(async () => {
  process.env.OW_NAMESPACE = prevNamespace
  process.env.OW_DATA_DIR = prevDataDir
  mock.restore()
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("agentic_search returns report_path from search-agent output", async () => {
  const { AgenticSearchTool } = await loadAgenticSearchModule()

  const tool = await AgenticSearchTool.init()
  const result = await tool.execute(
    {
      query: "how to design search",
      query_context: "planing article with evidence needs",
    },
    {
      sessionID: "session-plan",
      messageID: "message-plan",
      agent: "plan",
      threadID: "thread-plan",
      projectID,
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => {},
      ask: async () => {},
    },
  )

  const payload = JSON.parse(result.output) as {
    report_path?: string
    sub_session_id: string
    assistant_message_id: string
  }

  expect(payload.report_path).toBe("spec/research/search-reports/how-to-design-search.md")
  expect(payload.sub_session_id.length).toBeGreaterThan(0)
  expect(payload.assistant_message_id).toBe("message_assistant_search_tool")
  expect(promptCalls[0]?.agent).toBe("search")
  expect(promptCalls[0]?.skipTitleGeneration).toBe(true)
  expect(promptCalls[0]?.text).toContain("query: how to design search")
  expect(promptCalls[0]?.text).toContain("query_context: planing article with evidence needs")
  expect(promptCalls[0]?.text).toContain("report_path: spec/research/search-reports/how-to-design-search.md")
})

test("agentic_search builds pinyin slug for Chinese query", async () => {
  const { AgenticSearchTool } = await loadAgenticSearchModule()
  const tool = await AgenticSearchTool.init()

  const result = await tool.execute(
    {
      query: "中文检索策略",
      query_context: "context",
    },
    {
      sessionID: "session-plan",
      messageID: "message-plan",
      agent: "plan",
      threadID: "thread-plan",
      projectID,
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => {},
      ask: async () => {},
    },
  )

  const payload = JSON.parse(result.output) as { report_path?: string }
  expect(payload.report_path).toBe("spec/research/search-reports/zhong-wen-jian-suo-ce-lue.md")
})

test("agentic_search adds numeric suffix when report file already exists", async () => {
  const { resolveWorkspacePath } = await import("../../src/util/workspace-path")
  const { AgenticSearchTool } = await loadAgenticSearchModule()
  const tool = await AgenticSearchTool.init()

  const firstPath = "spec/research/search-reports/how-to-design-search.md"
  const { resolvedPath } = resolveWorkspacePath(firstPath, projectID)
  await mkdir(path.dirname(resolvedPath), { recursive: true })
  await writeFile(resolvedPath, "existing", "utf8")

  const result = await tool.execute(
    {
      query: "how to design search",
      query_context: "context",
    },
    {
      sessionID: "session-plan",
      messageID: "message-plan",
      agent: "plan",
      threadID: "thread-plan",
      projectID,
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => {},
      ask: async () => {},
    },
  )

  const payload = JSON.parse(result.output) as { report_path?: string }
  expect(payload.report_path).toBe("spec/research/search-reports/how-to-design-search-2.md")
  expect(promptCalls[0]?.text).toContain("report_path: spec/research/search-reports/how-to-design-search-2.md")
})

test("agentic_search rejects when search subagent returns mismatched report path", async () => {
  const { AgenticSearchTool } = await loadAgenticSearchModule()
  const tool = await AgenticSearchTool.init()
  forcedReportPath = "spec/research/search-reports/wrong.md"

  await expect(
    tool.execute(
      {
        query: "expected query",
        query_context: "context",
      },
      {
        sessionID: "session-plan",
        messageID: "message-plan",
        agent: "plan",
        threadID: "thread-plan",
        projectID,
        abort: new AbortController().signal,
        messages: [],
        metadata: async () => {},
        ask: async () => {},
      },
    ),
  ).rejects.toThrow("unexpected REPORT_PATH")
})

test("agentic_search rejects non-plan callers", async () => {
  const { AgenticSearchTool } = await loadAgenticSearchModule()
  const tool = await AgenticSearchTool.init()

  await expect(
    tool.execute(
      {
        query: "query",
        query_context: "context",
      },
      {
        sessionID: "session-general",
        messageID: "message-general",
        agent: "general",
        threadID: "thread-general",
        projectID,
        abort: new AbortController().signal,
        messages: [],
        metadata: async () => {},
        ask: async () => {},
      },
    ),
  ).rejects.toThrow("Only the plan agent")
})
