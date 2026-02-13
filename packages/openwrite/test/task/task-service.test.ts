import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-task-service-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("createOrGetByIdempotency returns the same task for duplicate requests", async () => {
  const { TaskService } = await import("../../src/task/service")

  const first = await TaskService.createOrGetByIdempotency({
    projectID: "project-1",
    sessionID: "session-1",
    type: "handoff",
    source: "api",
    idempotencyKey: "same-key",
    input: {
      from_run_id: "run-a",
      to_run_id: "run-b",
      target_agent_name: "writer",
    },
  })
  const second = await TaskService.createOrGetByIdempotency({
    projectID: "project-1",
    sessionID: "session-1",
    type: "handoff",
    source: "api",
    idempotencyKey: "same-key",
    input: {
      from_run_id: "run-a",
      to_run_id: "run-c",
      target_agent_name: "writer",
    },
  })

  expect(first.created).toBe(true)
  expect(second.created).toBe(false)
  expect(second.task.id).toBe(first.task.id)
  expect(second.task.input.to_run_id).toBe("run-b")

  await TaskService.markFail(first.task.id, {
    code: "TEST_DONE",
    message: "cleanup",
  })
})
