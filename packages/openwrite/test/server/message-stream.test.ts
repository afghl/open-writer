import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { publish } from "@/bus"
import { messageCreated, messageFinished } from "@/bus/events"

const userMessageID = "message_user_stream"
const assistantMessageID = "message_assistant_stream"
const createdAt = 1_777_000_000_000
const completedAt = createdAt + 1_000
let namespaceRoot = ""
let projectID = ""
let sessionID = ""

mock.module("@/session/prompt", () => ({
  SessionPrompt: {
    assertNotBusy() {
      return
    },
    cancel() {
      return
    },
    async prompt(input: { sessionID: string }) {
      await publish(messageCreated, {
        sessionID: input.sessionID,
        messageID: userMessageID,
        role: "user",
        createdAt,
      })
      await publish(messageFinished, {
        sessionID: input.sessionID,
        messageID: assistantMessageID,
        role: "assistant",
        completedAt,
        finishReason: "stop",
        parentUserMessageID: userMessageID,
      })
      return {
        info: {
          id: assistantMessageID,
          sessionID: input.sessionID,
          role: "assistant" as const,
          parentID: userMessageID,
          agent: "plan",
          finish: "stop" as const,
          time: {
            created: createdAt,
            completed: completedAt,
          },
        },
        parts: [],
      }
    },
  },
}))

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-stream-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")

  const { Project } = await import("../../src/project")
  const { Session } = await import("../../src/session")

  const project = await Project.create({
    title: "Stream test project",
    curr_agent_name: "plan",
  })
  const session = await Session.create({ projectID: project.id })
  await Project.update(project.id, (draft) => {
    draft.curr_session_id = session.id
  })

  projectID = project.id
  sessionID = session.id
})

afterAll(async () => {
  mock.restore()
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

function doneEventCount(payload: string) {
  return (payload.match(/^event: done$/gm) ?? []).length
}

test("message stream emits done once when finish event and fallback both emit", async () => {
  const { setupRoutes } = await import("../../src/server/route")
  const app = new Hono()
  setupRoutes(app)

  const response = await app.request("http://localhost/api/message/stream", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ow-proxy-token": "dev-openwrite-proxy-token",
      "x-project-id": projectID,
    },
    body: JSON.stringify({ text: "hello" }),
  })

  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("text/event-stream")

  const streamPayload = await response.text()
  expect(doneEventCount(streamPayload)).toBe(1)
})
