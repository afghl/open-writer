import { z } from "zod"
import type { SummaryRecord } from "./types"
import { Log } from "@/util/log"
import { LLM } from "@/llm"


const log = Log.create({ service: "library.summary" })

const RawSummarySchema = z.object({
  title: z.string().optional(),
  tldr: z.string().optional(),
  keyPoints: z.array(z.string()).optional(),
  evidencePoints: z.array(z.string()).optional(),
})

function trimLine(input: string) {
  return input.replace(/\s+/g, " ").trim()
}

function toTitleFallback(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => trimLine(line))
    .filter((line) => line.length > 0)
  if (lines.length === 0) return "Untitled Document"
  const first = lines[0]!
  return first.length > 70 ? `${first.slice(0, 67)}...` : first
}

export function slugifyTitle(title: string) {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
  return normalized || "untitled"
}

function fallbackSummary(text: string): SummaryRecord {
  const normalized = text.replace(/\s+/g, " ").trim()
  const title = toTitleFallback(text)
  const sentences = normalized
    .split(/(?<=[.?!])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const tldr = sentences[0] ?? (normalized.slice(0, 240) || "No summary available")
  const keyPoints = sentences.slice(0, 4)
  const evidencePoints = sentences.slice(1, 5)

  return {
    title,
    tldr,
    keyPoints: keyPoints.length > 0 ? keyPoints : [tldr],
    evidencePoints: evidencePoints.length > 0 ? evidencePoints : [tldr],
  }
}

function normalizeSummary(raw: z.infer<typeof RawSummarySchema>, sourceText: string): SummaryRecord {
  const fallback = fallbackSummary(sourceText)
  const title = trimLine(raw.title ?? "")
  const tldr = trimLine(raw.tldr ?? "")
  const keyPoints = (raw.keyPoints ?? [])
    .map((line) => trimLine(line))
    .filter((line) => line.length > 0)
    .slice(0, 6)
  const evidencePoints = (raw.evidencePoints ?? [])
    .map((line) => trimLine(line))
    .filter((line) => line.length > 0)
    .slice(0, 6)

  return {
    title: title || fallback.title,
    tldr: tldr || fallback.tldr,
    keyPoints: keyPoints.length > 0 ? keyPoints : fallback.keyPoints,
    evidencePoints: evidencePoints.length > 0 ? evidencePoints : fallback.evidencePoints,
  }
}

export async function buildSummary(input: {
  text: string
  sourceLabel: string
}): Promise<SummaryRecord> {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? ""
  if (!apiKey) {
    return fallbackSummary(input.text)
  }
  const llm = LLM.for("library.summary")

  const prompt = [
    "你正在提取简洁的写作资料库摘要。",
    "仅返回 JSON。",
    "规则：",
    "- title 应该可读且具体。",
    "- tldr 应为 1-2 句话。",
    "- keyPoints 应包含可执行的写作要点。",
    "- evidencePoints 应为来源中的具体事实/主张。",
    "- 不要臆造来源文本之外的事实。",
    `来源标签：${input.sourceLabel}`,
    "来源文本：",
    input.text.slice(0, 12000),
  ].join("\n")

  try {
    const result = await Promise.race([
      llm.generateObject({
        model: llm.model,
        schema: RawSummarySchema,
        prompt,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Summary generation timed out")), 15_000)
      }),
    ])
    const summary = normalizeSummary(result.object, input.text)
    log.info("Summary generation completed", {
      sourceLabel: input.sourceLabel,
      text: input.text.slice(0, 12000),
      summary,
    })
    return summary
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    log.error("Summary generation failed", {
      sourceLabel: input.sourceLabel,
      text: input.text.slice(0, 12000),
      error: errorMessage,
    })
    return fallbackSummary(input.text)
  }
}

export function renderSummaryMarkdown(input: {
  title: string
  tldr: string
  keyPoints: string[]
  evidencePoints: string[]
  source: string
}) {
  const lines: string[] = []
  lines.push(`# ${input.title}`)
  lines.push("")
  lines.push("## TL;DR")
  lines.push(input.tldr)
  lines.push("")
  lines.push("## Key Points")
  for (const point of input.keyPoints) {
    lines.push(`- ${point}`)
  }
  lines.push("")
  lines.push("## 可用于写作的证据点")
  for (const point of input.evidencePoints) {
    lines.push(`- ${point}`)
  }
  lines.push("")
  lines.push("## 来源")
  lines.push(`- ${input.source}`)
  lines.push("")
  return lines.join("\n")
}
