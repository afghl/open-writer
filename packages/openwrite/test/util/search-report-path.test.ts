import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

let namespaceRoot = ""
let prevNamespace = ""
let prevDataDir = ""

beforeAll(async () => {
  namespaceRoot = await mkdtemp(path.join(os.tmpdir(), "openwrite-search-report-path-"))
  prevNamespace = process.env.OW_NAMESPACE ?? ""
  prevDataDir = process.env.OW_DATA_DIR ?? ""
  process.env.OW_NAMESPACE = namespaceRoot
  process.env.OW_DATA_DIR = path.join(namespaceRoot, "data")
})

afterAll(async () => {
  process.env.OW_NAMESPACE = prevNamespace
  process.env.OW_DATA_DIR = prevDataDir
  if (namespaceRoot) {
    await rm(namespaceRoot, { recursive: true, force: true })
  }
})

test("resolveUniqueSearchReportPath builds pinyin slug for pure Chinese query", async () => {
  const { resolveUniqueSearchReportPath } = await import("../../src/util/search-report-path")
  const reportPath = await resolveUniqueSearchReportPath({
    projectID: "project-search-report-path-cn",
    query: "纯中文检索问题",
  })
  expect(reportPath).toBe("spec/research/search-reports/chun-zhong-wen-jian-suo-wen-ti.md")
})

test("resolveUniqueSearchReportPath appends numeric suffix for pinyin slug collisions", async () => {
  const projectID = "project-search-report-path-cn-collision"
  const query = "纯中文检索问题"
  const { resolveUniqueSearchReportPath } = await import("../../src/util/search-report-path")
  const { resolveWorkspacePath } = await import("../../src/util/workspace-path")

  const firstPath = await resolveUniqueSearchReportPath({
    projectID,
    query,
  })
  const { resolvedPath } = resolveWorkspacePath(firstPath, projectID)
  await mkdir(path.dirname(resolvedPath), { recursive: true })
  await writeFile(resolvedPath, "existing", "utf8")

  const secondPath = await resolveUniqueSearchReportPath({
    projectID,
    query,
  })

  expect(firstPath).toBe("spec/research/search-reports/chun-zhong-wen-jian-suo-wen-ti.md")
  expect(secondPath).toBe("spec/research/search-reports/chun-zhong-wen-jian-suo-wen-ti-2.md")
})
