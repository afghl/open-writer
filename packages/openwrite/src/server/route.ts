import { Hono } from "hono"
import { z } from "zod"
import { Session } from "@/session"
import { SessionPrompt } from "@/session/prompt"
import { Log } from "@/util/log"

export const app = new Hono()
const sessionPromptInput = z.object({ text: z.string().min(1), agent: z.string().min(1).optional() })

export function setupRoutes(app: Hono) {
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