import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""
let dataRoot = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-project-"))
  dataRoot = path.join(namespaceRoot, "data")
  process.env.OPENWRITE_NAMESPACE = namespaceRoot
  process.env.OPENWRITE_DATA_DIR = dataRoot
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("project create sets project_slug equal to project id", async () => {
  const { Project } = await import("../../src/project")
  const project = await Project.create({
    curr_agent_name: "plan",
  })

  expect(project.project_slug).toBe(project.id)
})

test("project list sorts projects by updated desc", async () => {
  const { Project } = await import("../../src/project")
  const first = await Project.create({
    title: "first",
    curr_agent_name: "plan",
  })
  const second = await Project.create({
    title: "second",
    curr_agent_name: "plan",
  })

  await Project.update(first.id, (draft) => {
    draft.title = "first-updated"
  })

  const projects = await Project.list()
  const firstIndex = projects.findIndex((item) => item.id === first.id)
  const secondIndex = projects.findIndex((item) => item.id === second.id)

  expect(firstIndex).toBeGreaterThanOrEqual(0)
  expect(secondIndex).toBeGreaterThanOrEqual(0)
  expect(firstIndex).toBeLessThan(secondIndex)
})
