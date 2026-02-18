import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

type PromptCall = {
  sessionID: string
  text: string
  agent?: string
  skipTitleGeneration?: boolean
}

const promptCalls: PromptCall[] = []

mock.module("@/session/prompt", () => ({
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
          id: "message_assistant_search",
          role: "assistant",
          sessionID: input.sessionID,
          parentID: "message_user_search",
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
            messageID: "message_assistant_search",
            text: "## Query & Scope\nquery ok",
          },
          {
            id: "part_tool_1",
            type: "tool",
            sessionID: input.sessionID,
            messageID: "message_assistant_search",
            callID: "call_1",
            tool: "search_candidates",
            state: {
              status: "completed",
              input: { query: "ok" },
              output: "{}",
              title: "search_candidates",
              metadata: { hits: 1 },
              time: {
                start: Date.now(),
                end: Date.now(),
              },
            },
          },
        ],
      }
    },
  },
}))

let namespaceRoot = ""
let projectID = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-search-route-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")

  const { Project } = await import("../../src/project")
  const { Session } = await import("../../src/session")

  const project = await Project.create({
    title: "Search route project",
    curr_agent_name: "plan",
  })
  const session = await Session.create({ projectID: project.id })
  await Project.update(project.id, (draft) => {
    draft.curr_session_id = session.id
  })

  projectID = project.id
})

afterAll(async () => {
  mock.restore()
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("search-agent route uses search agent without mutating active project session", async () => {
  const { setupRoutes } = await import("../../src/server/route")
  const { Project } = await import("../../src/project")

  const before = await Project.get(projectID)

  const app = new Hono()
  setupRoutes(app)

  const response = await app.request("http://localhost/api/search-agent/thread", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ow-proxy-token": "dev-openwrite-proxy-token",
      "x-project-id": projectID,
    },
    body: JSON.stringify({
      query: "how to design search",
      scope: {
        paths: ["inputs/library/docs"],
      },
      k: 5,
      max_steps: 4,
    }),
  })

  expect(response.status).toBe(200)

  const payload = await response.json() as {
    session_id: string
    assistant_message_id: string
    report_markdown: string
    tool_trace: Array<{ tool: string; status: string }>
  }

  expect(payload.assistant_message_id).toBe("message_assistant_search")
  expect(payload.report_markdown).toContain("## Query & Scope")
  expect(payload.tool_trace).toHaveLength(1)
  expect(payload.tool_trace[0]?.tool).toBe("search_candidates")
  expect(payload.tool_trace[0]?.status).toBe("completed")

  expect(promptCalls.length).toBe(1)
  expect(promptCalls[0]?.agent).toBe("search")
  expect(promptCalls[0]?.skipTitleGeneration).toBe(true)
  expect(promptCalls[0]?.text).toContain("query: how to design search")

  const after = await Project.get(projectID)
  expect(after.curr_agent_name).toBe(before.curr_agent_name)
  expect(after.curr_session_id).toBe(before.curr_session_id)
  expect(after.curr_thread_id).toBe(before.curr_thread_id)
  expect(after.title).toBe(before.title)
  expect(payload.session_id).not.toBe(before.curr_session_id)
})
