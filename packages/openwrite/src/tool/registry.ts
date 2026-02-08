import type { Agent } from "@/agent/types"
import type { Tool } from "./tool"
import { GetWeatherTool } from "./get_weather"

export namespace ToolRegistry {
  const custom = new Map<string, Tool.Info>()

  export async function register(tool: Tool.Info) {
    custom.set(tool.id, tool)
  }

  function filterTools(input: Tool.Info[], agent?: Agent) {
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
    const builtins = [GetWeatherTool]
    const filtered = filterTools([...builtins, ...custom.values()], agent)
    const result = await Promise.all(
      filtered.map(async (t) => ({
        id: t.id,
        ...(await t.init()),
      })),
    )
    return result
  }
}
