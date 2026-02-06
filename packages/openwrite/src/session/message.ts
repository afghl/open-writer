import { z } from "zod"
import type { ModelMessage } from "ai"

export namespace Message {
  const PartBase = z.object({
    id: z.string(),
    sessionID: z.string(),
    messageID: z.string(),
  })

  export const TextPart = PartBase.extend({
    type: z.literal("text"),
    text: z.string(),
    synthetic: z.boolean().optional(),
    time: z
      .object({
        start: z.number(),
        end: z.number().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }).meta({ ref: "TextPart" })
  export type TextPart = z.infer<typeof TextPart>

  export const ReasoningPart = PartBase.extend({
    type: z.literal("reasoning"),
    text: z.string(),
    time: z.object({
      start: z.number(),
      end: z.number().optional(),
    }),
    metadata: z.record(z.string(), z.any()).optional(),
  }).meta({ ref: "ReasoningPart" })
  export type ReasoningPart = z.infer<typeof ReasoningPart>

  export const ToolStatePending = z.object({
    status: z.literal("pending"),
    input: z.record(z.string(), z.any()),
    raw: z.string().optional(),
  })
  export type ToolStatePending = z.infer<typeof ToolStatePending>

  export const ToolStateRunning = z.object({
    status: z.literal("running"),
    input: z.record(z.string(), z.any()),
    title: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    time: z.object({
      start: z.number(),
    }),
  })
  export type ToolStateRunning = z.infer<typeof ToolStateRunning>

  export const ToolStateCompleted = z.object({
    status: z.literal("completed"),
    input: z.record(z.string(), z.any()),
    output: z.string(),
    title: z.string(),
    metadata: z.record(z.string(), z.any()),
    time: z.object({
      start: z.number(),
      end: z.number(),
    }),
  })
  export type ToolStateCompleted = z.infer<typeof ToolStateCompleted>

  export const ToolStateError = z.object({
    status: z.literal("error"),
    input: z.record(z.string(), z.any()),
    error: z.string(),
    metadata: z.record(z.string(), z.any()).optional(),
    time: z.object({
      start: z.number(),
      end: z.number(),
    }),
  })
  export type ToolStateError = z.infer<typeof ToolStateError>

  export const ToolState = z.discriminatedUnion("status", [
    ToolStatePending,
    ToolStateRunning,
    ToolStateCompleted,
    ToolStateError,
  ])
  export type ToolState = z.infer<typeof ToolState>

  export const ToolPart = PartBase.extend({
    type: z.literal("tool"),
    callID: z.string(),
    tool: z.string(),
    state: ToolState,
    metadata: z.record(z.string(), z.any()).optional(),
  }).meta({ ref: "ToolPart" })
  export type ToolPart = z.infer<typeof ToolPart>

  export const StepStartPart = PartBase.extend({
    type: z.literal("step-start"),
  }).meta({ ref: "StepStartPart" })
  export type StepStartPart = z.infer<typeof StepStartPart>

  export const StepFinishPart = PartBase.extend({
    type: z.literal("step-finish"),
    reason: z.string(),
  }).meta({ ref: "StepFinishPart" })
  export type StepFinishPart = z.infer<typeof StepFinishPart>

  export const Part = z
    .discriminatedUnion("type", [TextPart, ReasoningPart, ToolPart, StepStartPart, StepFinishPart])
    .meta({ ref: "Part" })
  export type Part = z.infer<typeof Part>

  const Base = z.object({
    id: z.string(),
    sessionID: z.string(),
  })

  export const User = Base.extend({
    role: z.literal("user"),
    time: z.object({
      created: z.number(),
    }),
    agent: z.string(),
  }).meta({ ref: "UserMessage" })
  export type User = z.infer<typeof User>

  export const Assistant = Base.extend({
    role: z.literal("assistant"),
    parentID: z.string(),
    agent: z.string(),
    time: z.object({
      created: z.number(),
      completed: z.number().optional(),
    }),
  }).meta({ ref: "AssistantMessage" })
  export type Assistant = z.infer<typeof Assistant>

  export const Info = z.discriminatedUnion("role", [User, Assistant]).meta({ ref: "Message" })
  export type Info = z.infer<typeof Info>

  export const WithParts = z.object({
    info: Info,
    parts: z.array(Part),
  })
  export type WithParts = z.infer<typeof WithParts>

  export function toModelMessages(input: WithParts[]): ModelMessage[] {
    const result: ModelMessage[] = []
    for (const msg of input) {
      const texts = msg.parts
        .filter((part) => part.type === "text" && !(part.synthetic ?? false))
        .map((part) => (part as TextPart).text)
        .filter((text) => text.trim().length > 0)
      if (texts.length === 0) continue
      if (msg.info.role === "user") {
        result.push({ role: "user", content: texts.join("\n") })
      } else {
        result.push({ role: "assistant", content: texts.join("\n") })
      }
    }
    return result
  }
}
