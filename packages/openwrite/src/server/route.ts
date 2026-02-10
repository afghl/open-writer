import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { subscribeAll } from "@/bus"
import { runRequestContextAsync } from "@/context"
import { Session } from "@/session"
import { SessionPrompt } from "@/session/prompt"

export const app = new Hono()
const sessionPromptInput = z.object({ text: z.string().min(1), agent: z.string().min(1).optional() })

const PROJECT_ID_HEADER = "x-project-id"

export function setupRoutes(app: Hono) {
  app.use("*", async (c, next) => {
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
          c.req.raw.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          )
        })
      } finally {
        clearInterval(keepalive)
        unsub?.()
      }
    }, async (err) => {
      unsub?.()
      console.error(err)
    })
  })

  app.post("/api/session/:id/prompt", async (c) => {
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

    try {
      const message = await SessionPrompt.prompt({
        sessionID: c.req.param("id"),
        text: parsed.data.text,
        agent: parsed.data.agent,
      })
      return c.json({ message })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }
  })
}

export const serverConfig = {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
}