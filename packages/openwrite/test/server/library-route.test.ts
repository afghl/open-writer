import { afterAll, beforeAll, expect, test } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""
let projectID = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-library-route-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")

  const { Project } = await import("../../src/project")
  const project = await Project.create({
    title: "Library import project",
    curr_agent_name: "plan",
  })
  projectID = project.id
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("library import API rejects unsupported file extension", async () => {
  const { setupRoutes } = await import("../../src/server/route")
  const app = new Hono()
  setupRoutes(app)

  const formData = new FormData()
  formData.set("file", new File(["hello"], "sample.md", { type: "text/markdown" }))

  const response = await app.request("http://localhost/api/library/import", {
    method: "POST",
    headers: {
      "x-ow-proxy-token": "dev-openwrite-proxy-token",
      "x-project-id": projectID,
    },
    body: formData,
  })

  expect(response.status).toBe(400)
  const payload = await response.json() as { code: string }
  expect(payload.code).toBe("UNSUPPORTED_FILE_TYPE")
})
