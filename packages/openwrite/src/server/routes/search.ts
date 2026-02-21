import type { Hono } from "hono"
import { ctx } from "@/context"
import { runAgenticSearch } from "@/tool"
import { agenticSearchInput } from "../schemas"

export function registerSearchRoutes(app: Hono) {
  app.post("/api/agentic-search", async (c) => {
    let body
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }

    const parsed = agenticSearchInput.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }

    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }

    try {
      const result = await runAgenticSearch({
        projectID,
        query: parsed.data.query,
        queryContext: parsed.data.query_context,
      })
      return c.json({
        ...(result.report_path ? { report_path: result.report_path } : {}),
        sub_session_id: result.sub_session_id,
        assistant_message_id: result.assistant_message_id,
        assistant_text: result.assistant_text,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return c.json({ error: message }, 500)
    }
  })
}
