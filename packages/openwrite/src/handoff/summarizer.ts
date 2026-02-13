import type { Task } from "@/task/types"
import type { Message } from "@/session/message"
import type { HandoffTaskInput } from "./types"

function stringifyValue(value: unknown) {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === null || value === undefined) return ""
  return JSON.stringify(value)
}

function toLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyValue(item).trim())
      .filter((line) => line.length > 0)
  }
  const text = stringifyValue(value).trim()
  return text ? [text] : []
}

function firstNonEmpty(input: Array<unknown>) {
  for (const item of input) {
    if (typeof item === "string" && item.trim().length > 0) {
      return item.trim()
    }
    if (Array.isArray(item) && item.length > 0) {
      return stringifyValue(item)
    }
    if (item && typeof item === "object") {
      return stringifyValue(item)
    }
  }
  return ""
}

export namespace HandoffSummarizer {
  export function toUserMessage(input: {
    task: Task.Info
    handoffInput: HandoffTaskInput
    handoff: Record<string, unknown>
    history: Message.WithParts[]
  }) {
    const objective = firstNonEmpty([
      input.handoff.objective,
      input.handoff.goal,
      input.handoff.title,
      input.handoff.summary,
    ])
    const constraints = toLines(
      input.handoff.constraints ?? input.handoff.rules ?? input.handoff.must_follow,
    )
    const risks = toLines(
      input.handoff.outstanding_risks ?? input.handoff.risks ?? input.handoff.questions,
    )
    const historySummary = summarizeHistory(input.history)

    const lines: string[] = []
    lines.push("# Handoff Meta")
    lines.push(`- task_id: ${input.task.id}`)
    lines.push(`- from_run_id: ${input.handoffInput.from_run_id}`)
    lines.push(`- to_run_id: ${input.handoffInput.to_run_id}`)
    lines.push(`- target_agent: ${input.handoffInput.target_agent_name}`)
    if (input.handoffInput.reason?.trim()) {
      lines.push(`- handoff_reason: ${input.handoffInput.reason.trim()}`)
    }
    lines.push("")
    lines.push("# Writing Objective")
    lines.push(`- ${objective || "Follow spec/handoff.json to produce the writing output."}`)
    lines.push("")
    lines.push("# Constraints")
    if (constraints.length === 0) {
      lines.push("- Must follow constraints from spec/handoff.json and spec/spec.md.")
    } else {
      for (const item of constraints) {
        lines.push(`- ${item}`)
      }
    }
    lines.push("")
    lines.push("# Outstanding Risks")
    if (risks.length === 0) {
      lines.push("- No explicit risk listed.")
    } else {
      for (const item of risks) {
        lines.push(`- ${item}`)
      }
    }
    lines.push("")
    lines.push("# Previous Run Summary")
    if (historySummary.length === 0) {
      lines.push("- No meaningful prior conversation content found.")
    } else {
      for (const item of historySummary) {
        lines.push(`- ${item}`)
      }
    }
    lines.push("")
    lines.push("# Action Request")
    lines.push("- Start writing in this run based on this handoff package.")

    return lines.join("\n")
  }
}

function summarizeHistory(history: Message.WithParts[]) {
  const items: string[] = []
  const normalized = history
    .slice(-10)
    .map((message) => {
      const text = message.parts
        .filter((part): part is Message.TextPart => part.type === "text")
        .map((part) => part.text.trim())
        .filter((line) => line.length > 0)
        .join("\n")
        .replace(/\s+/g, " ")
        .trim()
      return {
        role: message.info.role,
        text,
      }
    })
    .filter((message) => message.text.length > 0)

  for (const item of normalized) {
    const clipped = item.text.length > 220 ? `${item.text.slice(0, 217)}...` : item.text
    items.push(`${item.role}: ${clipped}`)
  }
  return items
}
