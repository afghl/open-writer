import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const publishCalls: Array<{ def: { type: string }; payload: Record<string, unknown> }> = []

mock.module("@/bus", () => ({
  publish: async (def: { type: string }, payload: Record<string, unknown>) => {
    publishCalls.push({ def, payload })
  },
}))

const projectID = "project-test-edit"
let namespaceRoot = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-edit-"))
  process.env.OW_NAMESPACE = namespaceRoot
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("edit tool publishes fs.updated after successful write", async () => {
  publishCalls.length = 0

  const { projectWorkspaceRoot } = await import("../../src/path/workspace")
  const { EditTool } = await import("../../src/tool/edit")

  const root = projectWorkspaceRoot(projectID)
  await mkdir(root, { recursive: true })
  const filePath = path.join(root, "doc.txt")
  await writeFile(filePath, "hello world", "utf8")

  const tool = await EditTool.init()
  await tool.execute(
    {
      filePath: `projects/${projectID}/workspace/doc.txt`,
      oldString: "world",
      newString: "openwrite",
    },
    {
      sessionID: "s1",
      messageID: "m1",
      agent: "plan",
      runID: "run-1",
      projectID,
      abort: new AbortController().signal,
      messages: [],
      metadata: async () => {},
      ask: async () => {},
    },
  )

  const updated = await readFile(filePath, "utf8")
  expect(updated).toBe("hello openwrite")
  expect(publishCalls.length).toBe(1)
  expect(publishCalls[0]?.def.type).toBe("fs.updated")
  expect(publishCalls[0]?.payload).toMatchObject({
    projectID,
    path: `projects/${projectID}/workspace/doc.txt`,
    kind: "file",
    source: "agent_tool",
  })
  expect(typeof publishCalls[0]?.payload.time).toBe("number")
})
