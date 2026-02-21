import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const projectID = "project-test-fs"
let namespaceRoot = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-fs-"))
  process.env.OW_NAMESPACE = namespaceRoot
})

afterAll(async () => {
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("listTree returns directory-first sorted nodes", async () => {
  const { projectWorkspaceRoot } = await import("../../src/path/workspace")
  const { listTree } = await import("../../src/fs/workspace")

  const root = projectWorkspaceRoot(projectID)
  await mkdir(path.join(root, "docs"), { recursive: true })
  await writeFile(path.join(root, "b.txt"), "b", "utf8")
  await writeFile(path.join(root, "a.txt"), "a", "utf8")
  await writeFile(path.join(root, "docs", "note.md"), "hello", "utf8")

  const result = await listTree({
    projectID,
    path: `projects/${projectID}/workspace`,
    depth: 2,
  })

  expect(result.root.kind).toBe("dir")
  expect(result.root.children?.map((item) => item.name)).toEqual(["docs", "a.txt", "b.txt"])
  expect(result.root.children?.[0]?.children?.[0]?.name).toBe("note.md")
})

test("readFile supports offset and limit", async () => {
  const { projectWorkspaceRoot } = await import("../../src/path/workspace")
  const { readFile } = await import("../../src/fs/workspace")

  const root = projectWorkspaceRoot(projectID)
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, "sample.txt"), "line1\nline2\nline3\nline4", "utf8")

  const result = await readFile({
    projectID,
    path: `projects/${projectID}/workspace/sample.txt`,
    offset: 1,
    limit: 2,
  })

  expect(result.path).toBe(`projects/${projectID}/workspace/sample.txt`)
  expect(result.content).toBe("line2\nline3")
  expect(result.totalLines).toBe(4)
  expect(result.truncated).toBe(true)
})

test("readFileRaw returns binary payload metadata", async () => {
  const { projectWorkspaceRoot } = await import("../../src/path/workspace")
  const { readFileRaw } = await import("../../src/fs/workspace")

  const root = projectWorkspaceRoot(projectID)
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, "sample.pdf"), "%PDF-1.4\n", "utf8")

  const result = await readFileRaw({
    projectID,
    path: `projects/${projectID}/workspace/sample.pdf`,
  })

  expect(result.path).toBe(`projects/${projectID}/workspace/sample.pdf`)
  expect(result.contentType).toBe("application/pdf")
  expect(result.fileName).toBe("sample.pdf")
  expect(result.bytes.toString("utf8")).toContain("%PDF-1.4")
})

test("readFile rejects workspace escape path", async () => {
  const { readFile } = await import("../../src/fs/workspace")

  await expect(
    readFile({
      projectID,
      path: "../../../../etc/passwd",
    }),
  ).rejects.toMatchObject({
    code: "INVALID_PATH",
  })
})
