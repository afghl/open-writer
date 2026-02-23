import { expect, test } from "bun:test"
import { AgenticSearchTool } from "../../src/tool/agentic-search"
import DESCRIPTION from "../../src/tool/agentic-search.txt"

test("agentic_search description is loaded from txt contract", async () => {
  const tool = await AgenticSearchTool.init()

  expect(tool.description).toBe(DESCRIPTION)
  expect(tool.description).toContain("独立子会话")
  expect(tool.description).toContain("inputs/library/**")
  expect(tool.description).toContain("report_path")
  expect(tool.description.includes("Run search subagent in a temporary session")).toBe(false)
})
