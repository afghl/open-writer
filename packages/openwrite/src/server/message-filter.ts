import type { MessagePart, MessageTextPart, MessageToolPart, MessageWithParts } from "@/session"

export function filterRenderableMessages(messages: MessageWithParts[]) {
  const TOOL_STEP_HINT = "Tool step completed."
  const TOOL_STEP_PREFIX = "Used tool:"
  const TOOL_STEPS_PREFIX = "Used tools:"
  const getToolNames = (parts: MessagePart[]) => {
    const names = parts
      .filter((part): part is MessageToolPart => part.type === "tool")
      .map((part) => part.tool.trim())
      .filter((name) => name.length > 0)
    return Array.from(new Set(names))
  }

  const toToolSummaryText = (toolNames: string[]) => {
    if (toolNames.length === 0) {
      return TOOL_STEP_HINT
    }
    if (toolNames.length === 1) {
      return `${TOOL_STEP_PREFIX} ${toolNames[0]}`
    }
    return `${TOOL_STEPS_PREFIX} ${toolNames.join(", ")}`
  }

  return messages
    .map((message) => ({
      ...message,
      parts: (() => {
        const textParts = message.parts.filter(
          (part): part is MessageTextPart =>
            part.type === "text"
            && !(part.synthetic ?? false)
            && part.text.trim().length > 0,
        )
        if (textParts.length > 0) {
          return textParts
        }
        if (message.info.role === "assistant" && message.parts.some((part) => part.type === "tool")) {
          const toolNames = getToolNames(message.parts)
          return [
            {
              id: `${message.info.id}_tool_summary`,
              sessionID: message.info.sessionID,
              messageID: message.info.id,
              type: "text",
              text: toToolSummaryText(toolNames),
              synthetic: true,
              kind: "tool",
            },
          ]
        }
        return []
      })(),
    }))
    .filter((message) => message.parts.length > 0)
}
