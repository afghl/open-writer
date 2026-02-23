import z from "zod"
import { agentRegistry } from "@/agent"
import { Session, SessionPrompt, type MessageTextPart, type MessageWithParts } from "@/session"
import { Tool } from "./tool"
import DESCRIPTION from "./agentic-search.txt"

export const AGENTIC_SEARCH_TOOL_ID = "agentic_search" as const

const AgenticSearchInputSchema = z.object({
  query: z.string().min(1).describe("The query objective."),
  query_context: z.string().min(1).describe("Extra context and constraints for the search task."),
})

export type AgenticSearchToolInput = z.infer<typeof AgenticSearchInputSchema>

export type AgenticSearchRunInput = {
  projectID: string
  query: string
  queryContext: string
  promptText?: string
}

export type AgenticSearchRunOutput = {
  report_path?: string
  assistant_text: string
  sub_session_id: string
  assistant_message_id: string
  message: MessageWithParts
}

export function buildSearchPrompt(input: {
  query: string
  queryContext: string
}) {
  return [
    "Run search and write the report file as required by your system prompt.",
    `query: ${input.query}`,
    `query_context: ${input.queryContext}`,
  ].join("\n")
}

function normalizePathToken(input: string) {
  return input
    .trim()
    .replace(/^`+/, "")
    .replace(/`+$/, "")
    .replace(/^['"]+/, "")
    .replace(/['"]+$/, "")
}

export function parseSearchAssistantResult(message: MessageWithParts) {
  if (message.info.role !== "assistant") {
    throw new Error("Search subagent did not return assistant output.")
  }

  const assistantText = message.parts
    .filter((part): part is MessageTextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim()

  const explicit = assistantText.match(/REPORT_PATH\s*:\s*(.+)/i)
  if (explicit?.[1]) {
    return {
      assistantText,
      reportPath: normalizePathToken(explicit[1]),
    }
  }

  const fallback = assistantText.match(/(spec\/research\/search-reports\/[^\s`'"]+\.md)/i)
  return {
    assistantText,
    reportPath: fallback?.[1],
  }
}

export async function runAgenticSearch(input: AgenticSearchRunInput): Promise<AgenticSearchRunOutput> {
  agentRegistry.resolveStrict("search")

  const promptText = input.promptText ?? buildSearchPrompt({
    query: input.query,
    queryContext: input.queryContext,
  })

  const tempSession = await Session.create({
    projectID: input.projectID,
    title: `Search session - ${new Date().toISOString()}`,
  })

  const message = await SessionPrompt.prompt({
    sessionID: tempSession.id,
    text: promptText,
    agent: "search",
    skipTitleGeneration: true,
  })

  const parsed = parseSearchAssistantResult(message)

  return {
    ...(parsed.reportPath ? { report_path: parsed.reportPath } : {}),
    assistant_text: parsed.assistantText,
    sub_session_id: tempSession.id,
    assistant_message_id: message.info.id,
    message,
  }
}

export const AgenticSearchTool = Tool.fromAgent({
  id: AGENTIC_SEARCH_TOOL_ID,
  targetAgentID: "search",
  description: DESCRIPTION,
  parametersSchema: AgenticSearchInputSchema,
  buildPrompt(args) {
    return buildSearchPrompt({
      query: args.query,
      queryContext: args.query_context,
    })
  },
  async run(input) {
    const args = input.args
    const ctx = input.ctx
    if (ctx.agent !== "plan") {
      throw new Error("Only the plan agent can invoke agentic_search.")
    }

    return runAgenticSearch({
      projectID: ctx.projectID,
      query: args.query,
      queryContext: args.query_context,
      promptText: input.prompt,
    })
  },
  async formatOutput(input) {
    return {
      title: AGENTIC_SEARCH_TOOL_ID,
      metadata: {
        ...(input.runResult.report_path ? { report_path: input.runResult.report_path } : {}),
        sub_session_id: input.runResult.sub_session_id,
        assistant_message_id: input.runResult.assistant_message_id,
      },
      output: JSON.stringify({
        ...(input.runResult.report_path ? { report_path: input.runResult.report_path } : {}),
        sub_session_id: input.runResult.sub_session_id,
        assistant_message_id: input.runResult.assistant_message_id,
      }, null, 2),
    }
  },
})
