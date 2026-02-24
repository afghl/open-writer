import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""
let projectID = ""
const runCalls: Array<{ projectID: string; query: string; queryContext: string }> = []
const actualAgenticSearch = await import("../../src/tool/agentic-search")

mock.module("@/tool/agentic-search", () => ({
  ...actualAgenticSearch,
  async runAgenticSearch(input: { projectID: string; query: string; queryContext: string }) {
    runCalls.push(input)
    return {
      report_path: "spec/research/search-reports/how-to-design-search.md",
      assistant_text: "REPORT_PATH: spec/research/search-reports/how-to-design-search.md",
      sub_session_id: "session_search_stub",
      assistant_message_id: "message_assistant_search_stub",
      message: {
        info: {
          id: "message_assistant_search_stub",
          role: "assistant",
        },
        parts: [],
      },
    }
  },
}))

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

test("agentic-search route runs subagent and returns report metadata", async () => {
  const { setupRoutes } = await import("../../src/server/route")

  const app = new Hono()
  setupRoutes(app)

  const response = await app.request("http://localhost/api/agentic-search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ow-proxy-token": "dev-openwrite-proxy-token",
      "x-project-id": projectID,
    },
    body: JSON.stringify({
      query: "how to design search",
      query_context: "extra context",
    }),
  })

  expect(response.status).toBe(200)
  const payload = await response.json() as {
    report_path?: string
    sub_session_id: string
    assistant_message_id: string
    assistant_text: string
  }
  expect(payload.report_path).toBe("spec/research/search-reports/how-to-design-search.md")
  expect(payload.sub_session_id).toBe("session_search_stub")
  expect(payload.assistant_message_id).toBe("message_assistant_search_stub")
  expect(payload.assistant_text).toContain("REPORT_PATH:")
  expect(runCalls[0]).toEqual({
    projectID,
    query: "how to design search",
    queryContext: "extra context",
  })
})
