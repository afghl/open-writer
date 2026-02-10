import { z } from "zod"
import { define } from "./event"

const messageEventProperties = z.object({
  sessionID: z.string(),
  messageID: z.string(),
  role: z.enum(["user", "assistant"]),
})

export const messageCreated = define("message.created", messageEventProperties)
export const messageFinished = define("message.finished", messageEventProperties)
