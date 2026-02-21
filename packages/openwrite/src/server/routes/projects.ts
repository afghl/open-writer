import type { Hono } from "hono"
import { agentRegistry } from "@/agent"
import { Project } from "@/project"
import { Session } from "@/session"
import { projectCreateInput } from "../schemas"

export function registerProjectRoutes(app: Hono) {
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
}
