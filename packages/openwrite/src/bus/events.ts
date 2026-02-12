import { z } from "zod"
import { define } from "./event"

const finishReason = z.enum([
  "other",
  "length",
  "unknown",
  "error",
  "stop",
  "content-filter",
  "tool-calls",
])

const messageCreatedProperties = z.object({
  sessionID: z.string(),
  messageID: z.string(),
  role: z.enum(["user", "assistant"]),
  createdAt: z.number(),
  parentUserMessageID: z.string().optional(),
})

const messageFinishedProperties = z.object({
  sessionID: z.string(),
  messageID: z.string(),
  role: z.enum(["user", "assistant"]),
  completedAt: z.number(),
  finishReason: finishReason.optional(),
  parentUserMessageID: z.string().optional(),
})

const messageDeltaProperties = z.object({
  sessionID: z.string(),
  messageID: z.string(),
  parentUserMessageID: z.string(),
  delta: z.string(),
})

const fsEventProperties = z.object({
  projectID: z.string(),
  path: z.string(),
  kind: z.enum(["file", "dir"]),
  source: z.enum(["agent_tool", "api", "external_upload"]),
  time: z.number(),
})

export const messageCreated = define("message.created", messageCreatedProperties)
export const messageFinished = define("message.finished", messageFinishedProperties)
export const messageDelta = define("message.delta", messageDeltaProperties)
export const fsCreated = define("fs.created", fsEventProperties)
export const fsUpdated = define("fs.updated", fsEventProperties)
export const fsDeleted = define("fs.deleted", fsEventProperties)
export const fsMoved = define(
  "fs.moved",
  fsEventProperties.extend({
    oldPath: z.string(),
  }),
)
