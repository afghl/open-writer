import { createOpenAI } from "@ai-sdk/openai"
import { streamText, tool, zodSchema } from "ai"
import type { ModelMessage, Tool as AITool } from "ai"
import type { Agent } from "@/agent"
import type { MessageWithParts, UserMessage } from "./message"
import type { ToolContext, ToolInfo } from "@/tool"
import { Permission } from "@/permission"
import { Log } from "@/util"

export type LLMStreamInput = {
  sessionID?: string
  projectID: string
  user: UserMessage
  messageID: string
  messages: ModelMessage[]
  tools: Array<Awaited<ReturnType<ToolInfo["init"]>> & { id: string }>
  history: MessageWithParts[]
  abort: AbortSignal
  system?: string[]
  agentRef?: Agent
}

export async function stream(input: LLMStreamInput) {
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
        const ctx: ToolContext = {
          sessionID: input.sessionID,
          messageID: input.messageID,
          agent: agentInfo?.name ?? "",
          runID: input.user.run_id,
          projectID: input.projectID,
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
    tools: Object.keys(tools),
  })
  const result = await streamText(req)
  return result
}

export const LLM = {
  stream,
}
