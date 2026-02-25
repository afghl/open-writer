import z from "zod"
import { promises as fs } from "node:fs"
import path from "node:path"
import { Session, SessionPrompt, type MessageTextPart, type MessageWithParts } from "@/session"
import { resolveUniqueSearchReportPath, searchReportPathPlaceholder } from "@/util/search-report-path"
import { resolveWorkspacePath } from "@/util/workspace-path"
import { fromAgent } from "./from-agent"
import DESCRIPTION from "./agentic-search.txt"

export const AGENTIC_SEARCH_TOOL_ID = "agentic_search" as const

const AgenticSearchInputSchema = z.object({
  query: z.string().min(1).describe("检索目标。"),
  query_context: z.string().min(1).describe("检索任务的补充上下文与约束。"),
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

const REPORT_SKELETON = [
  "## 问题回顾和思考",
  "## 完整回答",
  "## 证据原文",
].join("\n")

function upsertReportPathInPrompt(promptText: string, reportPath: string) {
  const lines = promptText
    .split("\n")
    .filter((line) => !/^\s*report_path\s*:/i.test(line))
  lines.push(`report_path: ${reportPath}`)
  return lines.join("\n")
}

async function ensureReportSkeletonFile(input: {
  projectID: string
  reportPath: string
}) {
  const { resolvedPath } = resolveWorkspacePath(input.reportPath, input.projectID)
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
  try {
    await fs.access(resolvedPath)
  } catch {
    await fs.writeFile(resolvedPath, REPORT_SKELETON, "utf8")
  }
}

export function buildSearchPrompt(input: {
  query: string
  queryContext: string
  reportPath: string
}) {
  return [
    "请按系统提示要求执行检索并写入报告文件。",
    `query: ${input.query}`,
    `query_context: ${input.queryContext}`,
    `report_path: ${input.reportPath}`,
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
  const expectedReportPath = await resolveUniqueSearchReportPath({
    projectID: input.projectID,
    query: input.query,
  })

  const basePromptText = input.promptText ?? buildSearchPrompt({
    query: input.query,
    queryContext: input.queryContext,
    reportPath: expectedReportPath,
  })
  const promptText = upsertReportPathInPrompt(basePromptText, expectedReportPath)
  await ensureReportSkeletonFile({
    projectID: input.projectID,
    reportPath: expectedReportPath,
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
  if (!parsed.reportPath) {
    throw new Error("Search subagent did not return REPORT_PATH.")
  }
  if (parsed.reportPath !== expectedReportPath) {
    throw new Error(
      `Search subagent returned unexpected REPORT_PATH: ${parsed.reportPath}; expected: ${expectedReportPath}`,
    )
  }

  return {
    report_path: expectedReportPath,
    assistant_text: parsed.assistantText,
    sub_session_id: tempSession.id,
    assistant_message_id: message.info.id,
    message,
  }
}

export const AgenticSearchTool = fromAgent({
  id: AGENTIC_SEARCH_TOOL_ID,
  targetAgentID: "search",
  description: DESCRIPTION,
  parametersSchema: AgenticSearchInputSchema,
  buildPrompt(args) {
    return buildSearchPrompt({
      query: args.query,
      queryContext: args.query_context,
      reportPath: searchReportPathPlaceholder(),
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
