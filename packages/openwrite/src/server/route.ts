import { Hono } from "hono"
import { z } from "zod"
import { generate } from "@/session/llm"
import { Session } from "@/session"
import { SessionPrompt } from "@/session/prompt"

export const app = new Hono()
const input = z.object({ prompt: z.string().min(1) })
const sessionCreateInput = z.object({ title: z.string().min(1).optional() })
const sessionPromptInput = z.object({ text: z.string().min(1), agent: z.string().min(1).optional() })

app.get("/health", (c) => c.json({ ok: true }))

app.post("/api/generate", async (c) => {
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400)
  }

  const parsed = input.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
  }

  try {
    const text = await generate(parsed.data.prompt)
    return c.json({ text })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return c.json({ error: message }, 500)
  }
})

app.post("/api/session", async (c) => {
  let body
  try {
    body = await c.req.json()
  } catch {
    body = {}
  }

  const parsed = sessionCreateInput.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
  }

  const session = await Session.create({ title: parsed.data.title })
  return c.json({ session })
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

export const serverConfig = {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
}

export default serverConfig
