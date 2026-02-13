import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-messages-by-run-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("messagesByRun filters history by run_id", async () => {
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
    run_id: "run-a",
    time: { created: Date.now() },
  })
  await Session.updatePart({
    id: "part-1",
    sessionID: session.id,
    messageID: "message-1",
    type: "text",
    text: "run a",
  })
  await Session.updateMessage({
    id: "message-2",
    sessionID: session.id,
    role: "user",
    agent: "writer",
    run_id: "run-b",
    time: { created: Date.now() + 1 },
  })
  await Session.updatePart({
    id: "part-2",
    sessionID: session.id,
    messageID: "message-2",
    type: "text",
    text: "run b",
  })

  const runA = await Session.messagesByRun({
    sessionID: session.id,
    runID: "run-a",
    defaultRunID: project.root_run_id,
  })
  const runB = await Session.messagesByRun({
    sessionID: session.id,
    runID: "run-b",
    defaultRunID: project.root_run_id,
  })

  expect(runA).toHaveLength(1)
  expect(runA[0]?.info.id).toBe("message-1")
  expect(runB).toHaveLength(1)
  expect(runB[0]?.info.id).toBe("message-2")
})

