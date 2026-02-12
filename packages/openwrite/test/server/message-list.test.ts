import { afterAll, beforeAll, expect, test } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const TOOL_STEP_HINT = "Tool step completed."

let namespaceRoot = ""
let projectID = ""
let sessionID = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-message-list-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")

  const { Project } = await import("../../src/project")
  const { Session } = await import("../../src/session")

  const project = await Project.create({
    title: "Messages test project",
    curr_agent_name: "plan",
  })
  const session = await Session.create({ projectID: project.id })
  await Project.update(project.id, (draft) => {
    draft.curr_session_id = session.id
  })

  const userMessageID = "message_user_tool_only"
  const assistantMessageID = "message_assistant_tool_only"
  const now = Date.now()

  await Session.updateMessage({
    id: userMessageID,
    role: "user",
    sessionID: session.id,
    agent: "plan",
    time: {
      created: now,
    },
  })
  await Session.updatePart({
    id: "part_user_tool_only",
    sessionID: session.id,
    messageID: userMessageID,
    type: "text",
    text: "run a tool",
  })

  await Session.updateMessage({
    id: assistantMessageID,
    role: "assistant",
    sessionID: session.id,
    parentID: userMessageID,
    agent: "plan",
    finish: "tool-calls",
    time: {
      created: now + 1,
      completed: now + 2,
    },
  })
  await Session.updatePart({
    id: "part_assistant_tool_only",
    sessionID: session.id,
    messageID: assistantMessageID,
    type: "tool",
    callID: "call_tool_only",
    tool: "read",
    state: {
      status: "completed",
      input: { path: "README.md" },
      output: "ok",
      title: "read",
      metadata: {},
      time: {
        start: now + 1,
        end: now + 2,
      },
    },
  })

  projectID = project.id
  sessionID = session.id
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("messages API keeps a synthetic text placeholder for tool-only assistant messages", async () => {
  const { setupRoutes } = await import("../../src/server/route")
  const app = new Hono()
  setupRoutes(app)

  const response = await app.request("http://localhost/api/messages", {
    method: "GET",
    headers: {
      "x-ow-proxy-token": "dev-openwrite-proxy-token",
      "x-project-id": projectID,
    },
  })

  expect(response.status).toBe(200)
  const payload = await response.json() as {
    sessionID: string
    messages: Array<{
      info: {
        id: string
        role: "user" | "assistant"
      }
      parts: Array<{
        type: string
        text: string
        synthetic?: boolean
      }>
    }>
  }

  expect(payload.sessionID).toBe(sessionID)

  const assistant = payload.messages.find((message) => message.info.role === "assistant")
  expect(assistant).toBeDefined()
  expect(assistant?.parts).toHaveLength(1)
  expect(assistant?.parts[0]?.type).toBe("text")
  expect(assistant?.parts[0]?.text).toBe(TOOL_STEP_HINT)
  expect(assistant?.parts[0]?.synthetic).toBe(true)
})
