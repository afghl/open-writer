import type { Tool } from "./tool"
import { GetWeatherTool } from "./get_weather"

export namespace ToolRegistry {
  const custom = new Map<string, Tool.Info>()

  export async function register(tool: Tool.Info) {
    custom.set(tool.id, tool)
  }

  export async function tools() {
    const builtins = [GetWeatherTool]
    const result = await Promise.all(
      [...builtins, ...custom.values()].map(async (t) => ({
        id: t.id,
        ...(await t.init()),
      })),
    )
    return result
  }
}
