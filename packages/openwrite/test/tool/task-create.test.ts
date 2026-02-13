import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-tool-task-create-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("handoff_to_writer tool creates handoff task for plan agent", async () => {
  const { Project } = await import("../../src/project")
  const { Session } = await import("../../src/session")
  const { TaskService } = await import("../../src/task/service")
  const { HandoffToWriterTool } = await import("../../src/tool/handoff-to-writer")
  const { projectWorkspaceRoot } = await import("../../src/path/workspace")

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

  const tool = await HandoffToWriterTool.init()
  const result = await tool.execute(
    {
      reason: "Spec is locked and ready",
    },
    {
      sessionID: session.id,
      messageID: "message-1",
      agent: "plan",
      runID: project.curr_run_id,
      projectID: project.id,
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => {},
      ask: async () => {},
    },
  )

  expect(result.title).toContain("Handoff task")
  const parsed = JSON.parse(result.output) as { task_id: string; status: string }
  let stored = await TaskService.get(parsed.task_id)
  for (let i = 0; i < 50 && stored.status === "processing"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    stored = await TaskService.get(parsed.task_id)
  }
  expect(["processing", "success"]).toContain(stored.status)
  expect(stored.input.target_agent_name).toBe("writer")
  expect(stored.input.reason).toBe("Spec is locked and ready")
})

test("handoff_to_writer tool rejects non-plan agents", async () => {
  const { Project } = await import("../../src/project")
  const { Session } = await import("../../src/session")
  const { HandoffToWriterTool } = await import("../../src/tool/handoff-to-writer")

  const project = await Project.create({
    curr_agent_name: "general",
  })
  const session = await Session.create({ projectID: project.id })
  await Project.update(project.id, (draft) => {
    draft.curr_session_id = session.id
  })

  const tool = await HandoffToWriterTool.init()
  await expect(
    tool.execute(
      {
        reason: "Need writing phase now",
      },
      {
        sessionID: session.id,
        messageID: "message-2",
        agent: "general",
        runID: project.curr_run_id,
        projectID: project.id,
        abort: new AbortController().signal,
        messages: [],
        metadata: async () => {},
        ask: async () => {},
      },
    ),
  ).rejects.toThrow("Only the plan agent")
})
