import { z } from "zod"
import { Identifier } from "@/id/id"
import { Session } from "@/session"
import { Message } from "@/session/message"
import { ToolRegistry } from "@/tool/registry"
import { SessionProcessor } from "@/session/processor"

export namespace SessionPrompt {
  export const PromptInput = z.object({
    sessionID: z.string(),
    text: z.string().min(1),
    agent: z.string().optional(),
  })
  export type PromptInput = z.infer<typeof PromptInput>

  export async function prompt(input: PromptInput) {
    const message = await createUserMessage(input)
    return loop(message.info.sessionID)
  }

  export async function loop(sessionID: string) {
    const messages = await Session.messages({ sessionID })
    const lastUser = [...messages].reverse().find((msg) => msg.info.role === "user")
    if (!lastUser || lastUser.info.role !== "user") {
      throw new Error("No user message found in session.")
    }

    const tools = await ToolRegistry.tools()
    const assistant: Message.Assistant = {
      id: Identifier.ascending("message"),
      role: "assistant",
      sessionID,
      parentID: lastUser.info.id,
      agent: lastUser.info.agent,
      time: {
        created: Date.now(),
      },
    }
    await Session.updateMessage(assistant)

    const processor = SessionProcessor.create({
      assistantMessage: assistant,
      sessionID,
      user: lastUser.info,
      history: messages,
      tools,
      messages: Message.toModelMessages(messages),
      abort: new AbortController().signal,
    })
    return processor.process()
  }

  async function createUserMessage(input: PromptInput): Promise<Message.WithParts> {
    const info: Message.User = {
      id: Identifier.ascending("message"),
      role: "user",
      sessionID: input.sessionID,
      agent: input.agent ?? "build",
      time: {
        created: Date.now(),
      },
    }

    const part: Message.TextPart = {
      id: Identifier.ascending("part"),
      sessionID: input.sessionID,
      messageID: info.id,
      type: "text",
      text: input.text,
    }

    await Session.updateMessage(info)
    await Session.updatePart(part)
    return { info, parts: [part] }
  }
}
