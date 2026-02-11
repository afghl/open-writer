import { z } from "zod"
import { define } from "./event"

const messageEventProperties = z.object({
  sessionID: z.string(),
  messageID: z.string(),
  role: z.enum(["user", "assistant"]),
})

const fsEventProperties = z.object({
  projectID: z.string(),
  path: z.string(),
  kind: z.enum(["file", "dir"]),
  source: z.enum(["agent_tool", "api", "external_upload"]),
  time: z.number(),
})

export const messageCreated = define("message.created", messageEventProperties)
export const messageFinished = define("message.finished", messageEventProperties)
export const fsCreated = define("fs.created", fsEventProperties)
export const fsUpdated = define("fs.updated", fsEventProperties)
export const fsDeleted = define("fs.deleted", fsEventProperties)
export const fsMoved = define(
  "fs.moved",
  fsEventProperties.extend({
    oldPath: z.string(),
  }),
)
