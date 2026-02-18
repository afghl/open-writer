import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-handoff-validator-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("validator accepts locked handoff files", async () => {
  const { Project } = await import("../../src/project")
  const { Session } = await import("../../src/session")
  const { projectWorkspaceRoot } = await import("../../src/path/workspace")
  const { HandoffValidator } = await import("../../src/handoff/validator")

  const project = await Project.create({
    curr_agent_name: "plan",
  })
  const session = await Session.create({ projectID: project.id })
  await Project.update(project.id, (draft) => {
    draft.curr_session_id = session.id
  })

  const workspaceRoot = projectWorkspaceRoot(project.id)
  const specDir = path.join(workspaceRoot, "spec")
  await mkdir(specDir, { recursive: true })
  await writeFile(path.join(specDir, "lock.json"), JSON.stringify({ locked: true }), "utf8")
  await writeFile(path.join(specDir, "handoff.json"), JSON.stringify({ objective: "write" }), "utf8")

  const task = {
    id: "task-1",
    project_id: project.id,
    session_id: session.id,
    type: "handoff" as const,
    status: "processing" as const,
    source: "api" as const,
    idempotency_key: "k",
    input: {
      from_thread_id: project.root_thread_id,
      to_thread_id: "thread-next",
      target_agent_name: "writer",
    },
    time: {
      created: Date.now(),
    },
  }

  const result = await HandoffValidator.validate({ project, task })
  expect(result.lock.locked).toBe(true)
  expect(result.handoff.objective).toBe("write")
})

test("validator fails when lock exists but not locked", async () => {
  const { Project } = await import("../../src/project")
  const { Session } = await import("../../src/session")
  const { projectWorkspaceRoot } = await import("../../src/path/workspace")
  const { HandoffValidator } = await import("../../src/handoff/validator")

  const project = await Project.create({
    curr_agent_name: "plan",
  })
  const session = await Session.create({ projectID: project.id })
  await Project.update(project.id, (draft) => {
    draft.curr_session_id = session.id
  })

  const workspaceRoot = projectWorkspaceRoot(project.id)
  const specDir = path.join(workspaceRoot, "spec")
  await mkdir(specDir, { recursive: true })
  await writeFile(path.join(specDir, "lock.json"), JSON.stringify({ locked: false }), "utf8")
  await writeFile(path.join(specDir, "handoff.json"), JSON.stringify({ objective: "write" }), "utf8")

  const task = {
    id: "task-2",
    project_id: project.id,
    session_id: session.id,
    type: "handoff" as const,
    status: "processing" as const,
    source: "api" as const,
    idempotency_key: "k-2",
    input: {
      from_thread_id: project.root_thread_id,
      to_thread_id: "thread-next",
      target_agent_name: "writer",
    },
    time: {
      created: Date.now(),
    },
  }

  await expect(HandoffValidator.validate({ project, task })).rejects.toThrow("not locked")
})

