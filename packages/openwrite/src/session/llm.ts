import { createOpenAI } from "@ai-sdk/openai"
import { generateText, streamText, tool, zodSchema, stepCountIs } from "ai"
import type { ModelMessage, Tool as AITool } from "ai"
import type { Message } from "@/session/message"
import type { Tool } from "@/tool/tool"
import { Permission } from "@/permission/permission"
import { Log } from "@/util/log"

export namespace LLM {

  export type StreamInput = {
    sessionID: string
    user: Message.User
    agent: string
    messageID: string
    messages: ModelMessage[]
    tools: Array<Awaited<ReturnType<Tool.Info["init"]>> & { id: string }>
    history: Message.WithParts[]
    abort: AbortSignal
    system?: string[]
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
    const model = provider("gpt-4o-mini")

    const tools: Record<string, AITool> = {}
    for (const item of input.tools) {
      tools[item.id] = tool({
        description: item.description,
        inputSchema: zodSchema(item.parameters),
        async execute(args, options) {
          const ctx: Tool.Context = {
            sessionID: input.sessionID,
            messageID: input.messageID,
            agent: input.agent,
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

    const system = input.system?.filter(Boolean).join("\n")
    const req = {
      model,
      abortSignal: input.abort,
      messages: input.messages,
      ...(system ? { system } : {}),
      tools,
    }
    log.info("call llm request. ", {
      messages: req.messages, system: req.system, model: req.model,
    })
    const result = await streamText(req)
    return result
  }
}