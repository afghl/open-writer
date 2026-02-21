import type { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { agentRegistry } from "@/agent"
import { ctx } from "@/context"
import { Project, type ProjectInfo } from "@/project"
import { Session, SessionPrompt } from "@/session"
import { messageCreated, messageDelta, messageFinished, subscribe } from "@/bus"
import { isNotFoundError } from "../errors"
import { messageListInput, sessionPromptInput } from "../schemas"
import { acquireSessionForChat, releaseSessionFromChat } from "../session-chat"
import { filterRenderableMessages } from "../message-filter"
import { SSE_KEEPALIVE_INTERVAL_MS } from "../constants"

export function registerMessageRoutes(app: Hono) {
  app.post("/api/message/stream", async (c) => {
    let body
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const parsed = sessionPromptInput.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }

    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }

    let project: ProjectInfo
    try {
      project = await Project.get(projectID)
    } catch (error) {
      if (isNotFoundError(error)) {
        return c.json({ error: `Project ${projectID} not found` }, 404)
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }

    const resolved = agentRegistry.resolve(project.curr_agent_name)
    const resolvedAgent = resolved.Info().name
    const sessionID = project.curr_session_id
    if (!sessionID) {
      return c.json({ error: "Session ID is required" }, 500)
    }

    let chatLocked = false

    try {
      await acquireSessionForChat(sessionID)
      chatLocked = true
      SessionPrompt.assertNotBusy(sessionID)
    } catch (error) {
      if (chatLocked) {
        await releaseSessionFromChat(sessionID)
        chatLocked = false
      }
      const message = error instanceof Error ? error.message : "Session is busy"
      return c.json({ error: message }, 409)
    }

    let rootUserMessageID = ""
    let latestAssistantMessageID = ""
    const emittedAssistantFinishIDs = new Set<string>()

    return streamSSE(c, async (stream) => {
      const keepalive = setInterval(() => {
        stream.writeSSE({ event: "ping", data: "" })
      }, SSE_KEEPALIVE_INTERVAL_MS)

      const writeEvent = async (eventName: string, payload: unknown) => {
        await stream.writeSSE({
          data: JSON.stringify(payload),
          event: eventName,
        })
      }

      const shouldHandleAssistant = (parentUserMessageID?: string) =>
        rootUserMessageID.length > 0 && parentUserMessageID === rootUserMessageID

      const unsubscribeCreated = subscribe(messageCreated, async (event) => {
        const payload = event.properties
        if (payload.sessionID !== sessionID) return

        if (payload.role === "user") {
          if (rootUserMessageID.length > 0) return
          rootUserMessageID = payload.messageID
          await writeEvent("user_ack", {
            sessionID: payload.sessionID,
            userMessageID: payload.messageID,
            createdAt: payload.createdAt,
          })
          return
        }

        if (!shouldHandleAssistant(payload.parentUserMessageID)) return
        latestAssistantMessageID = payload.messageID
        await writeEvent("assistant_start", {
          sessionID: payload.sessionID,
          assistantMessageID: payload.messageID,
          parentUserMessageID: payload.parentUserMessageID,
          createdAt: payload.createdAt,
        })
      })

      const unsubscribeDelta = subscribe(messageDelta, async (event) => {
        const payload = event.properties
        if (payload.sessionID !== sessionID) return
        if (!shouldHandleAssistant(payload.parentUserMessageID)) return
        if (payload.delta.length === 0) return
        latestAssistantMessageID = payload.messageID
        await writeEvent("text_delta", {
          sessionID: payload.sessionID,
          assistantMessageID: payload.messageID,
          delta: payload.delta,
        })
      })

      const unsubscribeFinished = subscribe(messageFinished, async (event) => {
        const payload = event.properties
        if (payload.sessionID !== sessionID || payload.role !== "assistant") return
        if (!shouldHandleAssistant(payload.parentUserMessageID)) return
        latestAssistantMessageID = payload.messageID
        if (emittedAssistantFinishIDs.has(payload.messageID)) return
        emittedAssistantFinishIDs.add(payload.messageID)
        await writeEvent("assistant_finish", {
          sessionID: payload.sessionID,
          assistantMessageID: payload.messageID,
          completedAt: payload.completedAt,
          finishReason: payload.finishReason ?? "stop",
        })
      })

      const abortListener = () => {
        SessionPrompt.cancel(sessionID)
      }
      c.req.raw.signal?.addEventListener("abort", abortListener, { once: true })

      try {
        const result = await SessionPrompt.prompt({
          sessionID,
          text: parsed.data.text,
          agent: resolvedAgent,
        })
        if (result.info.role === "assistant") {
          latestAssistantMessageID = result.info.id
          await writeEvent("done", {
            sessionID: result.info.sessionID,
            assistantMessageID: result.info.id,
            completedAt: result.info.time.completed ?? Date.now(),
            finishReason: result.info.finish ?? "stop",
          })
        }
      } catch (error) {
        const aborted =
          (error instanceof DOMException && error.name === "AbortError")
          || (error instanceof Error && error.name === "AbortError")
        await writeEvent("error", {
          code: "STREAM_RUNTIME_ERROR",
          message: aborted
            ? "Stream aborted"
            : error instanceof Error
              ? error.message
              : String(error),
          retriable: !aborted,
          ...(latestAssistantMessageID ? { assistantMessageID: latestAssistantMessageID } : {}),
        })
      } finally {
        clearInterval(keepalive)
        c.req.raw.signal?.removeEventListener("abort", abortListener)
        unsubscribeCreated()
        unsubscribeDelta()
        unsubscribeFinished()
        if (chatLocked) {
          await releaseSessionFromChat(sessionID)
          chatLocked = false
        }
      }
    }, async (err) => {
      if (chatLocked) {
        await releaseSessionFromChat(sessionID)
        chatLocked = false
      }
      console.error(err)
    })
  })

  app.post("/api/message", async (c) => {
    let body
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const parsed = sessionPromptInput.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }

    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }

    let project: ProjectInfo
    try {
      project = await Project.get(projectID)
    } catch (error) {
      if (isNotFoundError(error)) {
        return c.json({ error: `Project ${projectID} not found` }, 404)
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }

    try {
      const resolved = agentRegistry.resolve(project.curr_agent_name)
      const resolvedAgent = resolved.Info().name
      const sessionID = project.curr_session_id

      if (!sessionID) {
        throw new Error("Session ID is required")
      }

      await acquireSessionForChat(sessionID)
      try {
        const message = await SessionPrompt.prompt({
          sessionID,
          text: parsed.data.text,
          agent: resolvedAgent,
        })
        return c.json({ message })
      } finally {
        await releaseSessionFromChat(sessionID)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      if (
        message.includes("busy")
        || message.includes("handoff")
      ) {
        return c.json({ error: message }, 409)
      }
      return c.json({ error: message }, 500)
    }
  })

  app.get("/api/messages", async (c) => {
    const parsed = messageListInput.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }

    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }

    let project: ProjectInfo
    try {
      project = await Project.get(projectID)
    } catch (error) {
      if (isNotFoundError(error)) {
        return c.json({ error: `Project ${projectID} not found` }, 404)
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }

    const sessionID = project.curr_session_id
    if (!sessionID) {
      return c.json({ error: "Session ID is required" }, 500)
    }

    try {
      const allMessages = await Session.messages({
        sessionID,
        defaultThreadID: project.root_thread_id,
      })
      const filteredMessages = filterRenderableMessages(allMessages)
      const lastMessageID = parsed.data.last_message_id?.trim()
      const incrementMessages =
        lastMessageID && lastMessageID.length > 0
          ? (() => {
            const index = filteredMessages.findIndex((message) => message.info.id === lastMessageID)
            return index === -1 ? filteredMessages : filteredMessages.slice(index + 1)
          })()
          : filteredMessages
      const limit = parsed.data.limit
      const messages = typeof limit === "number"
        ? incrementMessages.slice(-limit)
        : incrementMessages
      return c.json({ sessionID, messages })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }
  })
}
