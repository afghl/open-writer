import { Hono } from "hono"
import { z } from "zod"
import { generate } from "../session/llm"
import { getEnv } from "../config/config"

const app = new Hono()
const input = z.object({ prompt: z.string().min(1) })

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

export default {
  port: Number(getEnv("PORT", "3000")),
  fetch: app.fetch,
}
