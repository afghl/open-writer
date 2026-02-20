import { afterAll, beforeAll, expect, test } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""
let projectID = ""

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
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("search-agent route is temporarily disabled", async () => {
  const { setupRoutes } = await import("../../src/server/route")

  const app = new Hono()
  setupRoutes(app)

  const response = await app.request("http://localhost/api/search-agent/thread", {
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

  expect(response.status).toBe(501)
  const payload = await response.json() as {
    error: string
    query: string
    query_context: string
  }
  expect(payload.error).toContain("temporarily disabled")
  expect(payload.query).toBe("how to design search")
  expect(payload.query_context).toBe("extra context")
})
