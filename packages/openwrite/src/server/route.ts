import { Hono, type Context } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { resolveProxyToken } from "./env"
import { subscribeAll } from "@/bus"
import { ctx, runRequestContextAsync } from "@/context"
import { agentRegistry } from "@/agent/registry"
import { Project } from "@/project"
import { Session } from "@/session"
import { SessionPrompt } from "@/session/prompt"
import { listTree, readFile } from "@/fs/workspace"
import { FsServiceError } from "@/fs/types"

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

  app.get("/event", async (c) => {
    let unsub: (() => void) | undefined
    return streamSSE(c, async (stream) => {
      unsub = subscribeAll((event) => {
        stream.writeSSE({
          data: JSON.stringify(event.properties),
          event: event.type,
        })
      })
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
              console.info("[sse] request aborted", {
                projectID: ctx()?.project_id ?? "",
                detail,
              })
              reject(new DOMException("Aborted", "AbortError"))
            },
            { once: true },
          )
        })
      } finally {
        console.info("[sse] stream cleanup", {
          projectID: ctx()?.project_id ?? "",
        })
        clearInterval(keepalive)
        unsub?.()
      }
    }, async (err) => {
      unsub?.()
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

      const message = await SessionPrompt.prompt({
        sessionID,
        text: parsed.data.text,
        agent: resolvedAgent,
      })
      return c.json({ message })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }
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

export const serverConfig = {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
}
