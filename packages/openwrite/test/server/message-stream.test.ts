import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { publish, messageCreated, messageDelta, messageFinished } from "@/bus"

type PromptInput = { sessionID: string }
type PromptResult = {
  info: {
    id: string
    sessionID: string
    role: "assistant"
    parentID: string
    agent: string
    thread_id: string
    finish: "other" | "length" | "unknown" | "error" | "stop" | "content-filter" | "tool-calls"
    time: {
      created: number
      completed: number
    }
  }
  parts: []
}

type ParsedSSEEvent = {
  event: string
  data: Record<string, unknown>
}

const userMessageID = "message_user_stream"
const assistantOneID = "message_assistant_stream_1"
const assistantTwoID = "message_assistant_stream_2"
const createdAt = 1_777_000_000_000

let namespaceRoot = ""
let projectID = ""
let sessionID = ""
let runScenario: (input: PromptInput) => Promise<PromptResult> = async () => {
  throw new Error("Stream scenario not configured")
}

mock.module("@/session/prompt", () => ({
  SessionPrompt: {
    assertNotBusy() {
      return
    },
    cancel() {
      return
    },
    async prompt(input: PromptInput) {
      return runScenario(input)
    },
  },
}))

function assistantResult(input: {
  sessionID: string
  parentID: string
  assistantMessageID: string
  createdAt: number
  completedAt: number
  finish: "other" | "length" | "unknown" | "error" | "stop" | "content-filter" | "tool-calls"
}): PromptResult {
  return {
    info: {
      id: input.assistantMessageID,
      sessionID: input.sessionID,
      role: "assistant",
      parentID: input.parentID,
      agent: "plan",
      thread_id: "thread-test",
      finish: input.finish,
      time: {
        created: input.createdAt,
        completed: input.completedAt,
      },
    },
    parts: [],
  }
}

function parseSSE(payload: string): ParsedSSEEvent[] {
  const packets = payload
    .split(/\r?\n\r?\n/)
    .map((packet) => packet.trim())
    .filter((packet) => packet.length > 0)

  const result: ParsedSSEEvent[] = []
  for (const packet of packets) {
    let event = "message"
    const dataLines: string[] = []
    for (const line of packet.split(/\r?\n/)) {
      if (line.startsWith(":")) continue
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim() || "message"
        continue
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart())
      }
    }
    if (dataLines.length === 0) continue
    const raw = dataLines.join("\n")
    if (event === "ping" || raw.length === 0) continue
    const parsed = JSON.parse(raw) as Record<string, unknown>
    result.push({ event, data: parsed })
  }
  return result
}

function findEventIndex(events: ParsedSSEEvent[], event: string, assistantMessageID?: string) {
  return events.findIndex((item) => {
    if (item.event !== event) return false
    if (!assistantMessageID) return true
    return item.data.assistantMessageID === assistantMessageID
  })
}

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

test("message stream emits assistant_finish for each assistant and done once at stream end", async () => {
  runScenario = async (input: PromptInput) => {
    await publish(messageCreated, {
      sessionID: input.sessionID,
      messageID: userMessageID,
      role: "user",
      createdAt,
    })
    await publish(messageCreated, {
      sessionID: input.sessionID,
      messageID: assistantOneID,
      role: "assistant",
      createdAt: createdAt + 10,
      parentUserMessageID: userMessageID,
    })
    await publish(messageFinished, {
      sessionID: input.sessionID,
      messageID: assistantOneID,
      role: "assistant",
      completedAt: createdAt + 20,
      finishReason: "tool-calls",
      parentUserMessageID: userMessageID,
    })
    await publish(messageCreated, {
      sessionID: input.sessionID,
      messageID: assistantTwoID,
      role: "assistant",
      createdAt: createdAt + 30,
      parentUserMessageID: userMessageID,
    })
    await publish(messageFinished, {
      sessionID: input.sessionID,
      messageID: assistantTwoID,
      role: "assistant",
      completedAt: createdAt + 40,
      finishReason: "stop",
      parentUserMessageID: userMessageID,
    })

    return assistantResult({
      sessionID: input.sessionID,
      parentID: userMessageID,
      assistantMessageID: assistantTwoID,
      createdAt: createdAt + 30,
      completedAt: createdAt + 40,
      finish: "stop",
    })
  }

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

  const payload = await response.text()
  const events = parseSSE(payload)

  const assistantStartIDs = events
    .filter((event) => event.event === "assistant_start")
    .map((event) => String(event.data.assistantMessageID))
  expect(assistantStartIDs).toEqual([assistantOneID, assistantTwoID])

  const assistantFinishEvents = events.filter((event) => event.event === "assistant_finish")
  expect(assistantFinishEvents).toHaveLength(2)
  expect(String(assistantFinishEvents[0]?.data.assistantMessageID)).toBe(assistantOneID)
  expect(String(assistantFinishEvents[0]?.data.finishReason)).toBe("tool-calls")
  expect(String(assistantFinishEvents[1]?.data.assistantMessageID)).toBe(assistantTwoID)
  expect(String(assistantFinishEvents[1]?.data.finishReason)).toBe("stop")

  const doneEvents = events.filter((event) => event.event === "done")
  expect(doneEvents).toHaveLength(1)
  expect(String(doneEvents[0]?.data.assistantMessageID)).toBe(assistantTwoID)
  expect(String(doneEvents[0]?.data.finishReason)).toBe("stop")

  const startOneIndex = findEventIndex(events, "assistant_start", assistantOneID)
  const finishOneIndex = findEventIndex(events, "assistant_finish", assistantOneID)
  const startTwoIndex = findEventIndex(events, "assistant_start", assistantTwoID)
  const finishTwoIndex = findEventIndex(events, "assistant_finish", assistantTwoID)
  const doneIndex = findEventIndex(events, "done")
  expect(startOneIndex).toBeGreaterThan(-1)
  expect(finishOneIndex).toBeGreaterThan(startOneIndex)
  expect(startTwoIndex).toBeGreaterThan(finishOneIndex)
  expect(finishTwoIndex).toBeGreaterThan(startTwoIndex)
  expect(doneIndex).toBeGreaterThan(finishTwoIndex)
})

test("message stream keeps text_delta separated by assistant message id", async () => {
  runScenario = async (input: PromptInput) => {
    await publish(messageCreated, {
      sessionID: input.sessionID,
      messageID: userMessageID,
      role: "user",
      createdAt: createdAt + 100,
    })
    await publish(messageCreated, {
      sessionID: input.sessionID,
      messageID: assistantOneID,
      role: "assistant",
      createdAt: createdAt + 110,
      parentUserMessageID: userMessageID,
    })
    await publish(messageDelta, {
      sessionID: input.sessionID,
      messageID: assistantOneID,
      parentUserMessageID: userMessageID,
      delta: "A1 ",
    })
    await publish(messageFinished, {
      sessionID: input.sessionID,
      messageID: assistantOneID,
      role: "assistant",
      completedAt: createdAt + 120,
      finishReason: "tool-calls",
      parentUserMessageID: userMessageID,
    })
    await publish(messageCreated, {
      sessionID: input.sessionID,
      messageID: assistantTwoID,
      role: "assistant",
      createdAt: createdAt + 130,
      parentUserMessageID: userMessageID,
    })
    await publish(messageDelta, {
      sessionID: input.sessionID,
      messageID: assistantTwoID,
      parentUserMessageID: userMessageID,
      delta: "A2",
    })
    await publish(messageFinished, {
      sessionID: input.sessionID,
      messageID: assistantTwoID,
      role: "assistant",
      completedAt: createdAt + 140,
      finishReason: "stop",
      parentUserMessageID: userMessageID,
    })

    return assistantResult({
      sessionID: input.sessionID,
      parentID: userMessageID,
      assistantMessageID: assistantTwoID,
      createdAt: createdAt + 130,
      completedAt: createdAt + 140,
      finish: "stop",
    })
  }

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
    body: JSON.stringify({ text: "hello with deltas" }),
  })

  expect(response.status).toBe(200)

  const payload = await response.text()
  const events = parseSSE(payload)
  const deltaByAssistant = new Map<string, string>()
  for (const event of events) {
    if (event.event !== "text_delta") continue
    const assistantMessageID = String(event.data.assistantMessageID)
    const delta = String(event.data.delta ?? "")
    deltaByAssistant.set(assistantMessageID, (deltaByAssistant.get(assistantMessageID) ?? "") + delta)
  }

  expect(deltaByAssistant.get(assistantOneID)).toBe("A1 ")
  expect(deltaByAssistant.get(assistantTwoID)).toBe("A2")

  const doneEvents = events.filter((event) => event.event === "done")
  expect(doneEvents).toHaveLength(1)
  expect(String(doneEvents[0]?.data.assistantMessageID)).toBe(assistantTwoID)
})
