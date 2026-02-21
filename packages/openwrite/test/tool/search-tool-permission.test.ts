import { expect, test } from "bun:test"

test("search tools are isolated to search agent", async () => {
  const { ToolRegistry } = await import("../../src/tool/registry")
  const { PlanAgent } = await import("../../src/agent/plan")
  const { GeneralAgent } = await import("../../src/agent/general")
  const { WriterAgent } = await import("../../src/agent/writer")
  const { SearchAgent } = await import("../../src/agent/search")

  const planTools = await ToolRegistry.tools(new PlanAgent())
  const generalTools = await ToolRegistry.tools(new GeneralAgent())
  const writerTools = await ToolRegistry.tools(new WriterAgent())
  const searchTools = await ToolRegistry.tools(new SearchAgent())

  const searchToolIDs = ["pinecone_hybrid_search", "resolve_chunk_evidence", "rerank"]

  for (const id of searchToolIDs) {
    expect(planTools.some((tool) => tool.id === id)).toBe(false)
    expect(generalTools.some((tool) => tool.id === id)).toBe(false)
    expect(writerTools.some((tool) => tool.id === id)).toBe(false)
  }

  expect(planTools.some((tool) => tool.id === "agentic_search")).toBe(true)
  expect(generalTools.some((tool) => tool.id === "agentic_search")).toBe(false)
  expect(writerTools.some((tool) => tool.id === "agentic_search")).toBe(false)
  expect(searchTools.some((tool) => tool.id === "agentic_search")).toBe(false)

  const ids = searchTools.map((tool) => tool.id)
  expect(ids).toContain("pinecone_hybrid_search")
  expect(ids).toContain("resolve_chunk_evidence")
  expect(ids).toContain("rerank")
  expect(ids).toContain("read")
  expect(ids).toContain("edit")
  expect(ids).toContain("bash")
})
