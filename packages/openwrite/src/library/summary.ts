import { createOpenAI } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { z } from "zod"
import type { SummaryRecord } from "./types"

const SummarySchema = z.object({
  title: z.string().min(1),
  tldr: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1).max(6),
  evidencePoints: z.array(z.string().min(1)).min(1).max(6),
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

export async function buildSummary(input: {
  text: string
  sourceLabel: string
}): Promise<SummaryRecord> {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? ""
  if (!apiKey) {
    return fallbackSummary(input.text)
  }

  const provider = createOpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
  })

  const prompt = [
    "You are extracting a concise writing-library summary.",
    "Return JSON only.",
    "Rules:",
    "- title should be human-readable and specific.",
    "- tldr should be 1-2 sentences.",
    "- keyPoints should contain actionable points for writing.",
    "- evidencePoints should be concrete facts/claims from source.",
    "- Do not hallucinate facts beyond source text.",
    `Source label: ${input.sourceLabel}`,
    "Source text:",
    input.text.slice(0, 12000),
  ].join("\n")

  try {
    const result = await Promise.race([
      generateObject({
        model: provider("gpt-4o-mini"),
        schema: SummarySchema,
        prompt,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Summary generation timed out")), 15_000)
      }),
    ])
    return result.object
  } catch {
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
