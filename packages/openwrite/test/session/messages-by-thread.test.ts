import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-messages-by-thread-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("messagesByThread filters history by thread_id", async () => {
  const { Project } = await import("../../src/project")
  const { Session } = await import("../../src/session")

  const project = await Project.create({
    curr_agent_name: "plan",
  })
  const session = await Session.create({ projectID: project.id })

  await Session.updateMessage({
    id: "message-1",
    sessionID: session.id,
    role: "user",
    agent: "plan",
    thread_id: "thread-a",
    time: { created: Date.now() },
  })
  await Session.updatePart({
    id: "part-1",
    sessionID: session.id,
    messageID: "message-1",
    type: "text",
    text: "thread a",
  })
  await Session.updateMessage({
    id: "message-2",
    sessionID: session.id,
    role: "user",
    agent: "writer",
    thread_id: "thread-b",
    time: { created: Date.now() + 1 },
  })
  await Session.updatePart({
    id: "part-2",
    sessionID: session.id,
    messageID: "message-2",
    type: "text",
    text: "thread b",
  })

  const threadA = await Session.messagesByThread({
    sessionID: session.id,
    threadID: "thread-a",
    defaultThreadID: project.root_thread_id,
  })
  const threadB = await Session.messagesByThread({
    sessionID: session.id,
    threadID: "thread-b",
    defaultThreadID: project.root_thread_id,
  })

  expect(threadA).toHaveLength(1)
  expect(threadA[0]?.info.id).toBe("message-1")
  expect(threadB).toHaveLength(1)
  expect(threadB[0]?.info.id).toBe("message-2")
})
