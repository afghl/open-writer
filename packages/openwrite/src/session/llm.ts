import { createOpenAI } from "@ai-sdk/openai"
import { generateText, streamText, tool, zodSchema, stepCountIs } from "ai"
import type { ModelMessage, Tool as AITool } from "ai"
import type { Agent } from "@/agent/types"
import type { Message } from "@/session/message"
import type { Tool } from "@/tool/tool"
import { Permission } from "@/permission/permission"
import { Log } from "@/util/log"

export namespace LLM {

  export type StreamInput = {
    sessionID?: string
    user: Message.User
    messageID: string
    messages: ModelMessage[]
    tools: Array<Awaited<ReturnType<Tool.Info["init"]>> & { id: string }>
    history: Message.WithParts[]
    abort: AbortSignal
    system?: string[]
    agentRef?: Agent
  }
  export async function stream(input: StreamInput) {
    const log = Log.create({
      service: "llm.stream", sessionID: input.sessionID,
      messageID: input.messageID,
    })
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set")
    }
    const provider = createOpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
    })
    const agentInfo = input.agentRef?.Info()
    let modelID = "gpt-4o-mini"
    if (agentInfo?.model) {
      if (agentInfo.model.providerID !== "openai") {
        log.warn("Unsupported provider for agent model", {
          providerID: agentInfo.model.providerID,
        })
      } else {
        modelID = agentInfo.model.modelID
      }
    }
    const model = provider(modelID)

    const tools: Record<string, AITool> = {}
    for (const item of input.tools) {
      tools[item.id] = tool({
        description: item.description,
        inputSchema: zodSchema(item.parameters),
        async execute(args, options) {
          const ctx: Tool.Context = {
            sessionID: input.sessionID,
            messageID: input.messageID,
            agent: agentInfo?.name,
            abort: input.abort,
            callID: options.toolCallId,
            messages: input.history,
            metadata: async () => { },
            ask: Permission.ask,
          }
          return item.execute(args, ctx)
        },
      })
    }

    const system = [
      agentInfo?.prompt,
      ...(input.system ?? []),
    ]
      .filter(Boolean)
      .join("\n")
    const req = {
      model,
      abortSignal: input.abort,
      messages: input.messages,
      ...(agentInfo?.temperature !== undefined
        ? { temperature: agentInfo.temperature }
        : {}),
      ...(agentInfo?.topP !== undefined
        ? { topP: agentInfo.topP }
        : {}),
      ...(system ? { system } : {}),
      tools,
    }
    log.info("call llm request. ", {
      model: req.model, tools: Object.keys(tools),
    })
    const result = await streamText(req)
    return result
  }
}