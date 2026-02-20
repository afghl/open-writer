import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
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
            text: "REPORT_PATH: spec/research/search-reports/latest.md",
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

afterAll(async () => {
  process.env.OW_NAMESPACE = prevNamespace
  process.env.OW_DATA_DIR = prevDataDir
  mock.restore()
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("agentic_search returns report_path from search-agent output", async () => {
  const { AgenticSearchTool } = await import("../../src/tool/agentic-search")

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

  expect(payload.report_path).toBe("spec/research/search-reports/latest.md")
  expect(payload.sub_session_id.length).toBeGreaterThan(0)
  expect(payload.assistant_message_id).toBe("message_assistant_search_tool")
  expect(promptCalls[0]?.agent).toBe("search")
  expect(promptCalls[0]?.skipTitleGeneration).toBe(true)
  expect(promptCalls[0]?.text).toContain("query: how to design search")
  expect(promptCalls[0]?.text).toContain("query_context: planing article with evidence needs")
})

test("agentic_search rejects non-plan callers", async () => {
  const { AgenticSearchTool } = await import("../../src/tool/agentic-search")
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
