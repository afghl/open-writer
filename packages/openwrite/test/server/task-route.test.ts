import { afterAll, beforeAll, expect, test } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""
let projectID = ""
let sessionID = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-task-route-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

async function setupProject() {
  const { Project } = await import("../../src/project")
  const { Session } = await import("../../src/session")
  const { projectWorkspaceRoot } = await import("../../src/path/workspace")

  const project = await Project.create({
    title: "Task route project",
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
  await writeFile(
    path.join(specDir, "handoff.json"),
    JSON.stringify({
      objective: "Write from validated spec",
      constraints: ["No hype"],
      risks: ["Need audience check"],
    }),
    "utf8",
  )

  projectID = project.id
  sessionID = session.id
  return { project, session }
}

async function pollTask(app: Hono, taskID: string) {
  for (let i = 0; i < 60; i += 1) {
    const response = await app.request(`http://localhost/api/task/${taskID}`, {
      method: "GET",
      headers: {
        "x-ow-proxy-token": "dev-openwrite-proxy-token",
        "x-project-id": projectID,
      },
    })
    const payload = await response.json() as { task: { status: string } }
    if (payload.task.status !== "processing") {
      return payload
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("Timed out waiting for task completion")
}

test("task API creates and completes handoff task", async () => {
  const { setupRoutes } = await import("../../src/server/route")
  const { Project } = await import("../../src/project")
  const { Session } = await import("../../src/session")
  const app = new Hono()
  setupRoutes(app)

  await setupProject()

  const create = await app.request("http://localhost/api/task", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ow-proxy-token": "dev-openwrite-proxy-token",
      "x-project-id": projectID,
    },
    body: JSON.stringify({
      type: "handoff",
      input: {
        target_agent_name: "writer",
      },
    }),
  })

  expect(create.status).toBe(202)
  const created = await create.json() as { task: { id: string; status: string } }
  expect(created.task.status).toBe("processing")

  const completed = await pollTask(app, created.task.id)
  expect(completed.task.status).toBe("success")

  const project = await Project.get(projectID)
  expect(project.phase).toBe("writing")
  expect(project.curr_agent_name).toBe("writer")
  expect(project.curr_run_id).not.toBe(project.root_run_id)

  const messages = await Session.messages({
    sessionID,
    defaultRunID: project.root_run_id,
  })
  const handoffMessage = messages.find(
    (message) =>
      message.info.role === "user"
      && message.info.run_id === project.curr_run_id
      && message.info.agent === "writer",
  )
  expect(handoffMessage).toBeDefined()
  expect(handoffMessage?.parts[0]?.type).toBe("text")
})

test("chat endpoints reject when session is handoff_processing", async () => {
  const { setupRoutes } = await import("../../src/server/route")
  const { Session } = await import("../../src/session")
  const app = new Hono()
  setupRoutes(app)

  await setupProject()
  await Session.update(sessionID, (draft) => {
    draft.status = "handoff_processing"
    draft.active_task_id = "task_busy"
  })

  const response = await app.request("http://localhost/api/message", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ow-proxy-token": "dev-openwrite-proxy-token",
      "x-project-id": projectID,
    },
    body: JSON.stringify({ text: "hello" }),
  })

  expect(response.status).toBe(409)
  const payload = await response.json() as { error: string }
  expect(payload.error).toContain("handoff")
})

