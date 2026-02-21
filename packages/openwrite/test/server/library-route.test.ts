import { afterAll, beforeAll, expect, test } from "bun:test"
import { Hono } from "hono"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""
let projectID = ""
let prevAPIKey = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-library-route-"))
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
  prevAPIKey = process.env.OPENAI_API_KEY ?? ""
  process.env.OPENAI_API_KEY = ""

  const { Project } = await import("../../src/project")
  const project = await Project.create({
    title: "Library import project",
    curr_agent_name: "plan",
  })
  projectID = project.id
})

afterAll(async () => {
  process.env.OPENAI_API_KEY = prevAPIKey
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

test("library import API writes canonical source text path", async () => {
  const { setupRoutes } = await import("../../src/server/route")
  const { resolveWorkspacePath } = await import("../../src/util/workspace-path")
  const app = new Hono()
  setupRoutes(app)

  const formData = new FormData()
  formData.set("file", new File(["line1\nline2\nline3"], "sample.txt", { type: "text/plain" }))

  const createResponse = await app.request("http://localhost/api/library/import", {
    method: "POST",
    headers: {
      "x-ow-proxy-token": "dev-openwrite-proxy-token",
      "x-project-id": projectID,
    },
    body: formData,
  })

  expect(createResponse.status).toBe(202)
  const createPayload = await createResponse.json() as { import: { id: string } }
  const importID = createPayload.import.id

  let finalDocPath = ""
  let finalSourceTextPath = ""
  let lastStatus = "queued"
  let failMessage = ""
  for (let i = 0; i < 100; i += 1) {
    const statusResponse = await app.request(`http://localhost/api/library/import/${importID}`, {
      method: "GET",
      headers: {
        "x-ow-proxy-token": "dev-openwrite-proxy-token",
        "x-project-id": projectID,
      },
    })
    expect(statusResponse.status).toBe(200)
    const statusPayload = await statusResponse.json() as {
      import: { status: string; error?: { message?: string } }
      doc?: { doc_path: string; source_text_path?: string }
    }
    lastStatus = statusPayload.import.status
    failMessage = statusPayload.import.error?.message ?? ""

    if (statusPayload.import.status === "success") {
      finalDocPath = statusPayload.doc?.doc_path ?? ""
      finalSourceTextPath = statusPayload.doc?.source_text_path ?? ""
      break
    }
    if (statusPayload.import.status === "fail") {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  expect(lastStatus).toBe("success")
  expect(failMessage).toBe("")
  expect(finalDocPath).toContain("inputs/library/docs/")
  expect(finalSourceTextPath).toContain("inputs/library/docs/text/")

  const { resolvedPath } = resolveWorkspacePath(finalSourceTextPath, projectID)
  const content = await readFile(resolvedPath, "utf8")
  expect(content).toContain("line1")
  expect(content).toContain("line3")
})
