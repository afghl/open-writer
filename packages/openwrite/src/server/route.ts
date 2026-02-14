import { Hono, type Context } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { resolveProxyToken } from "./env"
import { subscribe } from "@/bus"
import { ctx, runRequestContextAsync } from "@/context"
import { Identifier } from "@/id/id"
import { agentRegistry } from "@/agent/registry"
import { Project } from "@/project"
import { Session } from "@/session"
import { Message } from "@/session/message"
import { SessionPrompt } from "@/session/prompt"
import { TaskRunner, TaskService } from "@/task"
import { listTree, readFile } from "@/fs/workspace"
import { FsServiceError } from "@/fs/types"
import { LibraryImportRunner, LibraryImportService, LibraryServiceError } from "@/library"
import {
  fsCreated,
  fsDeleted,
  fsMoved,
  fsUpdated,
  messageCreated,
  messageDelta,
  messageFinished,
} from "@/bus/events"

export const app = new Hono()
const sessionPromptInput = z.object({ text: z.string().min(1), agent: z.string().min(1).optional() })
const projectCreateInput = z.object({ title: z.string().min(1).optional() })
const fsTreeInput = z.object({
  path: z.string().optional(),
  depth: z.coerce.number().int().min(0).optional(),
})
const fsReadInput = z.object({
  path: z.string().min(1),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).optional(),
})
const messageListInput = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  last_message_id: z.string().min(1).optional(),
})
const taskCreateInput = z.object({
  type: z.literal("handoff"),
  input: z.object({
    target_agent_name: z.string().min(1),
  }),
  idempotency_key: z.string().min(1).optional(),
})

const PROJECT_ID_HEADER = "x-project-id"
const PROXY_TOKEN_HEADER = "x-ow-proxy-token"

export function setupRoutes(app: Hono) {
  app.get("/healthz", (c) => c.json({ status: "ok" }))

  app.use("*", async (c, next) => {
    if (c.req.path === "/healthz") {
      return next()
    }
    const expectedToken = resolveProxyToken()
    const incomingToken = c.req.header(PROXY_TOKEN_HEADER)?.trim() ?? ""
    if (!incomingToken || incomingToken !== expectedToken) {
      return c.json({ error: "Unauthorized proxy request" }, 401)
    }
    return next()
  })

  app.use("*", async (c, next) => {
    if (
      c.req.path === "/healthz"
      || (c.req.method === "POST" && c.req.path === "/api/project")
      || (c.req.method === "GET" && c.req.path === "/api/projects")
    ) {
      return next()
    }
    const projectId = c.req.header(PROJECT_ID_HEADER) ?? ""
    if (!projectId) {
      throw new Error("Project ID is required")
    }
    return runRequestContextAsync({ project_id: projectId }, () => next())
  })

  const SSE_KEEPALIVE_INTERVAL_MS = 8_000

  app.get("/event/fs", async (c) => {
    const unsubscribers: Array<() => void> = []
    return streamSSE(c, async (stream) => {
      const subscribeFsEvent = (eventName: string, payload: unknown) => stream.writeSSE({
        data: JSON.stringify(payload),
        event: eventName,
      })
      unsubscribers.push(
        subscribe(fsCreated, (event) =>
          subscribeFsEvent(event.type, event.properties)),
        subscribe(fsUpdated, (event) =>
          subscribeFsEvent(event.type, event.properties)),
        subscribe(fsDeleted, (event) =>
          subscribeFsEvent(event.type, event.properties)),
        subscribe(fsMoved, (event) =>
          subscribeFsEvent(event.type, event.properties)),
      )
      const keepalive = setInterval(() => {
        stream.writeSSE({ event: "ping", data: "" })
      }, SSE_KEEPALIVE_INTERVAL_MS)
      try {
        await new Promise<void>((_, reject) => {
          c.req.raw.signal?.addEventListener(
            "abort",
            () => {
              const reason = c.req.raw.signal?.reason
              const detail =
                reason instanceof Error
                  ? `${reason.name}: ${reason.message}`
                  : reason === undefined
                    ? "undefined"
                    : String(reason)
              console.info("[sse] fs request aborted", {
                projectID: ctx()?.project_id ?? "",
                detail,
              })
              reject(new DOMException("Aborted", "AbortError"))
            },
            { once: true },
          )
        })
      } finally {
        console.info("[sse] fs stream cleanup", {
          projectID: ctx()?.project_id ?? "",
        })
        clearInterval(keepalive)
        for (const unsubscribe of unsubscribers) {
          unsubscribe()
        }
      }
    }, async (err) => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe()
      }
      console.error(err)
    })
  })

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

    let project: Project.Info
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

  app.get("/api/fs/tree", async (c) => {
    const parsed = fsTreeInput.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }
    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }
    try {
      const result = await listTree({
        projectID,
        path: parsed.data.path,
        depth: parsed.data.depth,
      })
      return c.json(result)
    } catch (error) {
      return fsErrorResponse(c, error)
    }
  })

  app.get("/api/fs/read", async (c) => {
    const parsed = fsReadInput.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }
    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }
    try {
      const result = await readFile({
        projectID,
        path: parsed.data.path,
        offset: parsed.data.offset,
        limit: parsed.data.limit,
      })
      return c.json(result)
    } catch (error) {
      return fsErrorResponse(c, error)
    }
  })

  app.post("/api/library/import", async (c) => {
    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }

    let formData: FormData
    try {
      formData = await c.req.raw.formData()
    } catch {
      return c.json({ error: "Invalid multipart/form-data body" }, 400)
    }

    const fileValue = formData.get("file")
    const urlValue = formData.get("url")
    const replaceDocIDValue = formData.get("replace_doc_id")
    const replaceDocID = typeof replaceDocIDValue === "string" ? replaceDocIDValue.trim() : ""

    let fileInput:
      | {
        name: string
        type: string
        size: number
        bytes: Buffer
      }
      | undefined

    if (fileValue instanceof File && fileValue.size > 0) {
      const bytes = Buffer.from(await fileValue.arrayBuffer())
      fileInput = {
        name: fileValue.name,
        type: fileValue.type,
        size: fileValue.size,
        bytes,
      }
    } else if (fileValue !== null && fileValue !== undefined && !(typeof fileValue === "string")) {
      return c.json({ error: "Invalid file input" }, 400)
    }

    const url = typeof urlValue === "string" ? urlValue.trim() : ""

    try {
      const created = await LibraryImportService.createImport({
        projectID,
        ...(fileInput ? { file: fileInput } : {}),
        ...(url ? { url } : {}),
        ...(replaceDocID ? { replaceDocID } : {}),
      })
      LibraryImportRunner.kick()
      return c.json({
        import: {
          id: created.id,
          status: created.status,
          stage: created.stage,
        },
      }, 202)
    } catch (error) {
      return libraryErrorResponse(c, error)
    }
  })

  app.get("/api/library/import/:id", async (c) => {
    const importID = c.req.param("id")?.trim()
    if (!importID) {
      return c.json({ error: "Import ID is required" }, 400)
    }

    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }

    try {
      const item = await LibraryImportService.getImport(projectID, importID)
      const doc = item.result?.doc_id
        ? await LibraryImportService.getDoc(projectID, item.result.doc_id).catch(() => undefined)
        : undefined
      return c.json({
        import: item,
        ...(doc ? { doc } : {}),
      })
    } catch (error) {
      return libraryErrorResponse(c, error)
    }
  })

  app.get("/api/library/docs", async (c) => {
    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }
    try {
      const docs = await LibraryImportService.listDocs(projectID)
      return c.json({ docs })
    } catch (error) {
      return libraryErrorResponse(c, error)
    }
  })

  app.post("/api/project", async (c) => {
    let body: unknown = {}
    try {
      const text = await c.req.text()
      if (text.trim()) {
        body = JSON.parse(text) as unknown
      }
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const parsed = projectCreateInput.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }

    try {
      const defaultAgent = agentRegistry.default()
      const project = await Project.create({
        title: parsed.data.title,
        curr_agent_name: defaultAgent,
      })
      const initialSession = await Session.create({
        projectID: project.id,
      })
      const ready = await Project.update(project.id, (draft) => {
        draft.curr_session_id = initialSession.id
      })
      return c.json({ project: ready })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }
  })

  app.get("/api/projects", async (c) => {
    try {
      const projects = await Project.list()
      return c.json({ projects })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }
  })

  app.post("/api/task", async (c) => {
    let body
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const parsed = taskCreateInput.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }

    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }

    let project: Project.Info
    try {
      project = await Project.get(projectID)
    } catch (error) {
      if (isNotFoundError(error)) {
        return c.json({ error: `Project ${projectID} not found` }, 404)
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }

    if (!project.curr_session_id) {
      return c.json({ error: "Session ID is required" }, 422)
    }

    const fromRunID = project.curr_run_id || project.root_run_id
    const toRunID = Identifier.ascending("run")
    const idempotencyKey = parsed.data.idempotency_key?.trim()
      || TaskService.fallbackIdempotencyKey({
        projectID,
        sessionID: project.curr_session_id,
        type: "handoff",
        payload: {
          from_run_id: fromRunID,
          to_run_id: "__next_run__",
          target_agent_name: parsed.data.input.target_agent_name,
        },
      })

    try {
      const result = await TaskService.createOrGetByIdempotency({
        projectID,
        sessionID: project.curr_session_id,
        type: "handoff",
        source: "api",
        idempotencyKey,
        createdByAgent: project.curr_agent_name,
        createdByRunID: fromRunID,
        input: {
          from_run_id: fromRunID,
          to_run_id: toRunID,
          target_agent_name: parsed.data.input.target_agent_name,
        },
      })
      TaskRunner.kick()
      return c.json({
        task: {
          id: result.task.id,
          status: result.task.status,
        },
      }, 202)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }
  })

  app.get("/api/task/:id", async (c) => {
    const taskID = c.req.param("id")?.trim()
    if (!taskID) {
      return c.json({ error: "Task ID is required" }, 400)
    }

    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }

    try {
      const task = await TaskService.get(taskID)
      if (task.project_id !== projectID) {
        return c.json({ error: `Task ${taskID} not found` }, 404)
      }
      return c.json({ task })
    } catch (error) {
      if (isNotFoundError(error)) {
        return c.json({ error: `Task ${taskID} not found` }, 404)
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }
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

    let project: Project.Info
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
      let sessionID = project.curr_session_id

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

    let project: Project.Info
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
        defaultRunID: project.root_run_id,
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

function filterRenderableMessages(messages: Message.WithParts[]) {
  const TOOL_STEP_HINT = "Tool step completed."
  const TOOL_STEP_PREFIX = "Used tool:"
  const TOOL_STEPS_PREFIX = "Used tools:"
  const getToolNames = (parts: Message.Part[]) => {
    const names = parts
      .filter((part): part is Message.ToolPart => part.type === "tool")
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
          (part): part is Message.TextPart =>
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

async function acquireSessionForChat(sessionID: string) {
  const changed = await Session.transitionStatus({
    sessionID,
    from: ["idle"],
    to: "chatting",
  })
  if (changed.changed) {
    return
  }
  const session = await Session.get(sessionID)
  if (session.status === "handoff_processing") {
    throw new Error("Session is processing a handoff task")
  }
  throw new Error(`Session ${sessionID} is busy`)
}

async function releaseSessionFromChat(sessionID: string) {
  await Session.transitionStatus({
    sessionID,
    from: ["chatting"],
    to: "idle",
  })
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const value = error as { code?: unknown }
  return value.code === "ENOENT"
}

function fsErrorResponse(c: Context, error: unknown) {
  if (!(error instanceof FsServiceError)) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return c.json({ error: message }, 500)
  }
  switch (error.code) {
    case "INVALID_PATH":
      return c.json({ error: error.message, code: error.code }, 400)
    case "NOT_FOUND":
      return c.json({ error: error.message, code: error.code }, 404)
    case "NOT_FILE":
    case "NOT_DIR":
      return c.json({ error: error.message, code: error.code }, 422)
    default:
      return c.json({ error: error.message, code: error.code }, 500)
  }
}

function libraryErrorResponse(c: Context, error: unknown) {
  if (isNotFoundError(error)) {
    return c.json({ error: "Resource not found" }, 404)
  }
  if (!(error instanceof LibraryServiceError)) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return c.json({ error: message }, 500)
  }

  switch (error.code) {
    case "INVALID_IMPORT_INPUT":
    case "INVALID_URL":
    case "INVALID_YOUTUBE_URL":
    case "UNSUPPORTED_URL":
    case "UNSUPPORTED_FILE_TYPE":
      return c.json({ error: error.message, code: error.code }, 400)
    case "FILE_TOO_LARGE":
      return c.json({ error: error.message, code: error.code }, 413)
    case "REPLACE_DOC_NOT_FOUND":
    case "YOUTUBE_TRANSCRIPT_UNAVAILABLE":
      return c.json({ error: error.message, code: error.code }, 404)
    default:
      return c.json({ error: error.message, code: error.code }, 500)
  }
}

export const serverConfig = {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
}
