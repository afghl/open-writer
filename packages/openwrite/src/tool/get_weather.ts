import z from "zod"
import { Tool } from "./tool"

export const GetWeatherTool = Tool.define("get_weather", {
  description: "Get current weather for a location (mocked).",
  parameters: z.object({
    location: z.string().min(1).describe("City or location name"),
  }),
  async execute(params, ctx: Tool.Context) {
    await ctx.ask({
      permission: "get_weather",
      patterns: [params.location],
      always: ["*"],
      metadata: { location: params.location },
    })

    const output = `Weather in ${params.location}: Sunny, 23°C, light breeze.`
    // try return an error here
    // if (Math.random() < 0.5) {
    //   throw new Error("Failed to get weather")
    // }
    return {
      title: `Weather for ${params.location}`,
      metadata: { source: "mock" },
      output,
    }
  },
})
