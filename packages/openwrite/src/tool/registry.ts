import type { Agent } from "@/agent"
import type { ToolInfo } from "./tool"

const custom = new Map<string, ToolInfo>()

export async function register(tool: ToolInfo) {
  custom.set(tool.id, tool)
}

function filterTools(input: ToolInfo[], agent?: Agent) {
  if (!agent) return input
  const info = agent.Info()
  const deny = info.permission.denyTools ?? []
  const allow = info.permission.allowTools ?? []
  let result = input.filter((tool) => !deny.includes(tool.id))
  if (allow.length > 0) {
    result = result.filter((tool) => allow.includes(tool.id))
  }
  return result
}

export async function tools(agent?: Agent) {
  const {
    ReadTool,
  } = await import("./read")
  const {
    EditTool,
  } = await import("./edit")
  const {
    BashTool,
  } = await import("./bash")
  const {
    HandoffToWriterTool,
  } = await import("./handoff-to-writer")
  const {
    PineconeHybridSearchTool,
  } = await import("./search-candidates")
  const {
    ResolveChunkEvidenceTool,
  } = await import("./fetch-chunks")
  const {
    MaterializeSearchEvidenceTool,
  } = await import("./materialize-search-evidence")
  const {
    AgenticSearchTool,
  } = await import("./agentic-search")
  const builtins = [
    ReadTool,
    EditTool,
    BashTool,
    HandoffToWriterTool,
    PineconeHybridSearchTool,
    ResolveChunkEvidenceTool,
    MaterializeSearchEvidenceTool,
    AgenticSearchTool,
  ]
  const filtered = filterTools([...builtins, ...custom.values()], agent)
  const result = await Promise.all(
    filtered.map(async (t) => ({
      id: t.id,
      ...(await t.init()),
    })),
  )
  return result
}

export const ToolRegistry = {
  register,
  tools,
}
