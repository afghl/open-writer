import { Identifier } from "@/id/id"
import { Session } from "@/session"
import { Message } from "@/session/message"
import type { Tool } from "@/tool/tool"
import { LLM } from "@/session/llm"
import type { ModelMessage } from "ai"
import { Log } from "@/util/log"
import type { Agent } from "@/agent/types"
import { publish } from "@/bus"
import { messageDelta } from "@/bus/events"

type CreateInput = {
  assistantMessage: Message.Assistant
  sessionID: string
  projectID: string
  user: Message.User
  history: Message.WithParts[]
  tools: Array<Awaited<ReturnType<Tool.Info["init"]>> & { id: string }>
  messages: ModelMessage[]
  abort: AbortSignal
  agentRef?: Agent
}

export const create = (input: CreateInput) => {
  const toolcalls = new Map<string, Message.ToolPart>()

  let currentText: Message.TextPart | undefined

  const result = {
    get message() {
      return input.assistantMessage
    },
    async process() {
      const log = Log.create({
        service: "processor.process", sessionID: input.sessionID,
        messageID: input.assistantMessage.id,
      })
      const stream = await LLM.stream({
        sessionID: input.sessionID,
        projectID: input.projectID,
        user: input.user,
        messageID: input.assistantMessage.id,
        messages: input.messages,
        tools: input.tools,
        history: input.history,
        abort: input.abort,
        agentRef: input.agentRef,
      })

      for await (const value of stream.fullStream) {
        switch (value.type) {
          case "text-start": {
            currentText = {
              id: Identifier.ascending("part"),
              sessionID: input.sessionID,
              messageID: input.assistantMessage.id,
              type: "text",
              text: "",
              time: { start: Date.now() },
            }
            break
          }
          case "text-delta": {
            if (!currentText) {
              currentText = {
                id: Identifier.ascending("part"),
                sessionID: input.sessionID,
                messageID: input.assistantMessage.id,
                type: "text",
                text: "",
                time: { start: Date.now() },
              }
            }
            currentText.text += value.text
            await Session.updatePart(currentText)
            if (value.text.length > 0) {
              await publish(messageDelta, {
                sessionID: input.sessionID,
                messageID: input.assistantMessage.id,
                parentUserMessageID: input.user.id,
                delta: value.text,
              })
            }
            break
          }
          case "text-end": {
            if (currentText) {
              currentText.time = { start: currentText.time?.start ?? Date.now(), end: Date.now() }
              await Session.updatePart(currentText)
            }
            currentText = undefined
            break
          }
          case "tool-input-start": {
            if (!toolcalls.has(value.id)) {
              const part: Message.ToolPart = {
                id: Identifier.ascending("part"),
                sessionID: input.sessionID,
                messageID: input.assistantMessage.id,
                type: "tool",
                callID: value.id,
                tool: value.toolName,
                state: {
                  status: "pending",
                  input: {},
                  raw: "",
                },
              }
              toolcalls.set(value.id, part)
              await Session.updatePart(part)
            }
            break
          }
          case "tool-call": {
            const part: Message.ToolPart = {
              id: toolcalls.get(value.toolCallId)?.id ?? Identifier.ascending("part"),
              sessionID: input.sessionID,
              messageID: input.assistantMessage.id,
              type: "tool",
              callID: value.toolCallId,
              tool: value.toolName,
              state: {
                status: "running",
                input: value.input ?? {},
                time: { start: Date.now() },
              },
            }
            toolcalls.set(value.toolCallId, part)
            await Session.updatePart(part)
            break
          }
          case "tool-result": {
            const match = toolcalls.get(value.toolCallId)
            if (!match) break
            const outputPayload = value.output ?? {}
            const output =
              typeof outputPayload === "string"
                ? outputPayload
                : typeof outputPayload.output === "string"
                  ? outputPayload.output
                  : JSON.stringify(outputPayload)
            const completed: Message.ToolPart = {
              ...match,
              state: {
                status: "completed",
                input: value.input ?? match.state.input,
                output,
                title: outputPayload.title ?? match.tool,
                metadata: outputPayload.metadata ?? {},
                time: {
                  start: match.state.status === "running" ? match.state.time.start : Date.now(),
                  end: Date.now(),
                },
              },
            }
            await Session.updatePart(completed)
            toolcalls.delete(value.toolCallId)
            break
          }
          case "tool-error": {
            const match = toolcalls.get(value.toolCallId)
            if (!match) {
              Log.Default.error("Tool call not found", { toolCallId: value.toolCallId })
              break
            }
            const failed: Message.ToolPart = {
              ...match,
              state: {
                status: "error",
                input: value.input ?? match.state.input,
                error: String(value.error ?? "Tool execution failed"),
                time: {
                  start: match.state.status === "running" ? match.state.time.start : Date.now(),
                  end: Date.now(),
                },
              },
            }
            await Session.updatePart(failed)
            toolcalls.delete(value.toolCallId)
            break
          }
          case "finish-step": {
            input.assistantMessage.finish = value.finishReason
          }
          case "finish": {
            input.assistantMessage.time.completed = Date.now()
            if (value.finishReason) {
              input.assistantMessage.finish = value.finishReason
            }
            await Session.updateMessage(input.assistantMessage)
            break
          }
          case "error": {
            throw value.error
          }
          default:
            break
        }
      }

      if (currentText) {
        currentText.time = { start: currentText.time?.start ?? Date.now(), end: Date.now() }
        await Session.updatePart(currentText)
        currentText = undefined
      }

      input.assistantMessage.time.completed = Date.now()
      if (!input.assistantMessage.finish) {
        input.assistantMessage.finish = "stop"
      }
      await Session.updateMessage(input.assistantMessage)

      const parts = await Session.parts(input.assistantMessage.id)
      return { info: input.assistantMessage, parts }
    },
  }
  return result
}

export const SessionProcessor = { create }
