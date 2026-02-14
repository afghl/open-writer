import { z } from "zod"
import { publish } from "@/bus"
import { messageCreated, messageFinished } from "@/bus"
import { Identifier } from "@/id"
import { Project } from "@/project"
import { Session } from "./core"
import { Message } from "./message"
import { ToolRegistry } from "@/tool"
import { SessionProcessor } from "./processor"
import { LLM } from "./llm"
import { agentRegistry } from "@/agent"
import { Log } from "@/util"
import type { AssistantMessage, MessageTextPart, MessageWithParts, UserMessage } from "./message"

const MAX_STEPS = 8

const busyState = new Map<
  string,
  {
    abort: AbortController
    callbacks: Array<{
      resolve(input: MessageWithParts): void
      reject(reason?: unknown): void
    }>
  }
>()

export const PromptInput = z.object({
  sessionID: z.string(),
  text: z.string().min(1),
  agent: z.string().optional(),
  skipTitleGeneration: z.boolean().optional(),
})
export type PromptInput = z.infer<typeof PromptInput>

export function assertNotBusy(sessionID: string) {
  if (busyState.has(sessionID)) {
    throw new Error(`Session ${sessionID} is busy`)
  }
}

  function start(sessionID: string) {
    if (busyState.has(sessionID)) return undefined
    const controller = new AbortController()
    busyState.set(sessionID, { abort: controller, callbacks: [] })
    return controller.signal
  }

export function cancel(sessionID: string) {
    const entry = busyState.get(sessionID)
    if (!entry) return
    entry.abort.abort()
    for (const callback of entry.callbacks) {
      callback.reject(new DOMException("Aborted", "AbortError"))
    }
    busyState.delete(sessionID)
  }

export async function prompt(input: PromptInput) {
    const agent = agentRegistry.resolve(input.agent)
    const agentInfo = agent.Info()
    const session = await Session.get(input.sessionID)
    const project = await Project.get(session.projectID)
    const runID = project.curr_run_id || project.root_run_id
    const message = await createUserMessage({
      ...input,
      agent: agentInfo.name,
      runID,
    })
    return loop(message.info.sessionID, message.info.run_id, {
      skipTitleGeneration: input.skipTitleGeneration ?? false,
    })
  }

export async function loop(
    sessionID: string,
    runID?: string,
    options?: { skipTitleGeneration?: boolean },
  ) {
    const abort = start(sessionID)
    if (!abort) {
      return new Promise<MessageWithParts>((resolve, reject) => {
        busyState.get(sessionID)?.callbacks.push({ resolve, reject })
      })
    }

    let lastResult: MessageWithParts | undefined
    let error: unknown
    let step = 0
    const session = await Session.get(sessionID)
    const projectID = session.projectID
    const project = await Project.get(projectID)
    const rootRunID = project.root_run_id
    const activeRunID = runID?.trim() || project.curr_run_id || rootRunID

    try {
      while (true) {
        if (abort.aborted) {
          throw new DOMException("Aborted", "AbortError")
        }

        const messages = await Session.messagesByRun({
          sessionID,
          runID: activeRunID,
          defaultRunID: rootRunID,
        })
        const lastUser = [...messages].reverse().find((msg) => msg.info.role === "user")
        if (!lastUser || lastUser.info.role !== "user") {
          throw new Error("No user message found in session.")
        }
        Log.Default.info("message count", { cnt: messages.length })

        const lastAssistant = [...messages].reverse().find((msg) => msg.info.role === "assistant")
        if (lastAssistant && lastAssistant.info.role === "assistant") {
          const hasPendingTool = messageHasPendingTool(lastAssistant)
          Log.Default.info("Has pending tool", { hasPendingTool })
          if (hasPendingTool) {
            lastResult = lastAssistant
            break
          }

          if (
            isAssistantFinished(lastAssistant) &&
            lastAssistant.info.parentID === lastUser.info.id &&
            lastAssistant.info.id > lastUser.info.id
          ) {
            lastResult = lastAssistant
            break
          }
        }

        const agent = agentRegistry.resolve(lastUser.info.agent)
        const agentInfo = agent.Info()
        const maxSteps = agentInfo.steps ?? MAX_STEPS
        if (step >= maxSteps) {
          Log.Default.warn("Max steps reached in session loop", { sessionID, step })
          break
        }
        step += 1

        const tools = await ToolRegistry.tools(agent)
        const assistant: AssistantMessage = {
          id: Identifier.ascending("message"),
          role: "assistant",
          sessionID,
          parentID: lastUser.info.id,
          agent: agentInfo.name,
          run_id: activeRunID,
          time: {
            created: Date.now(),
          },
        }
        await Session.updateMessage(assistant)
        await publish(messageCreated, {
          sessionID,
          messageID: assistant.id,
          role: "assistant",
          createdAt: assistant.time.created,
          parentUserMessageID: lastUser.info.id,
        })
        const modelMessage = Message.toModelMessages(messages)
        const processor = SessionProcessor.create({
          assistantMessage: assistant,
          sessionID,
          projectID,
          user: lastUser.info,
          history: messages,
          tools,
          messages: modelMessage,
          abort,
          // TODO: append references as system prompt?
          agentRef: agent,
        })
        lastResult = await processor.process()
        if (lastResult.info.role !== "assistant") {
          throw new Error("Expected assistant result")
        }

        await publish(messageFinished, {
          sessionID,
          messageID: lastResult.info.id,
          role: "assistant",
          completedAt: lastResult.info.time.completed ?? Date.now(),
          finishReason: lastResult.info.finish,
          parentUserMessageID: lastResult.info.parentID,
        })
        if (!options?.skipTitleGeneration) {
          await ensureTitleIfNeeded(sessionID, messages, lastResult)
        }
      }
    } catch (caught) {
      error = caught
      throw caught
    } finally {
      const entry = busyState.get(sessionID)
      if (entry) {
        if (error) {
          for (const callback of entry.callbacks) {
            callback.reject(error)
          }
        } else if (lastResult) {
          for (const callback of entry.callbacks) {
            callback.resolve(lastResult)
          }
        }
        busyState.delete(sessionID)
      }
    }

    if (!lastResult) {
      throw new Error("No assistant message generated.")
    }
    return lastResult
  }

async function createUserMessage(
    input: PromptInput & { agent: string; runID: string },
): Promise<MessageWithParts> {
  const info: UserMessage = {
      id: Identifier.ascending("message"),
      role: "user",
      sessionID: input.sessionID,
      agent: input.agent,
      run_id: input.runID,
      time: {
        created: Date.now(),
      },
    }

  const part: MessageTextPart = {
      id: Identifier.ascending("part"),
      sessionID: input.sessionID,
      messageID: info.id,
      type: "text",
      text: input.text,
    }

    await Session.updateMessage(info)
    await Session.updatePart(part)
    await publish(messageCreated, {
      sessionID: input.sessionID,
      messageID: info.id,
      role: "user",
      createdAt: info.time.created,
    })
    return { info, parts: [part] }
  }

async function ensureTitleIfNeeded(
    sessionID: string,
  history: MessageWithParts[],
  lastResult?: MessageWithParts,
  ) {
    if (!lastResult || lastResult.info.role !== "assistant" || !lastResult.info.time.completed) return
    const session = await Session.get(sessionID)
    const projectID = session.projectID
    const project = await Project.get(projectID)
    if (!project || !Project.isDefaultTitle(project.title)) return

    const firstRealUserIndex = history.findIndex(
      (msg) =>
        msg.info.role === "user" &&
        msg.parts.some((part) => part.type === "text" && part.text.trim().length > 0),
    )
    if (firstRealUserIndex === -1) return

    const firstUser = history[firstRealUserIndex].info as UserMessage
    try {
      const agent = agentRegistry.resolve(firstUser.agent)
      const result = await LLM.stream({
        projectID,
        user: firstUser,
        messageID: lastResult.info.id,
        messages: [
          { role: "user", content: "Generate a concise title for this conversation:" },
          ...Message.toModelMessages(history.slice(0, firstRealUserIndex + 1)),
        ],
        tools: [],
        history,
        abort: new AbortController().signal,
        system: [],
        agentRef: agent,
      })
      const text = await result.text
      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0)
      if (!cleaned) return
      const title = cleaned.length > 100 ? `${cleaned.slice(0, 97)}...` : cleaned
      await Project.update(projectID, (draft) => {
        draft.title = title
      })
    } catch (error) {
      Log.Default.warn("Failed to generate project title", { projectID, error })
    }
  }

function isAssistantFinished(message: MessageWithParts) {
    if (message.info.role !== "assistant") return false
    if (!message.info.time.completed) return false
    if (message.info.finish) {
      return !["tool-calls", "unknown"].includes(message.info.finish)
    }
    return !messageHasPendingTool(message)
  }

function messageHasPendingTool(message: MessageWithParts) {
    return message.parts.some(
      (part) =>
        part.type === "tool" &&
        (part.state.status === "pending" || part.state.status === "running"),
    )
  }
export const SessionPrompt = {
  PromptInput,
  assertNotBusy,
  cancel,
  prompt,
  loop,
}
