import type { Hono } from "hono"
import { Identifier } from "@/id"
import { ctx } from "@/context"
import { Project, type ProjectInfo } from "@/project"
import { TaskRunner, TaskService } from "@/task"
import { isNotFoundError } from "../errors"
import { taskCreateInput } from "../schemas"

export function registerTaskRoutes(app: Hono) {
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

    if (!project.curr_session_id) {
      return c.json({ error: "Session ID is required" }, 422)
    }

    const fromThreadID = project.curr_thread_id || project.root_thread_id
    const toThreadID = Identifier.ascending("thread")
    const idempotencyKey = parsed.data.idempotency_key?.trim()
      || TaskService.fallbackIdempotencyKey({
        projectID,
        sessionID: project.curr_session_id,
        type: "handoff",
        payload: {
          from_thread_id: fromThreadID,
          to_thread_id: "__next_thread__",
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
        createdByThreadID: fromThreadID,
        input: {
          from_thread_id: fromThreadID,
          to_thread_id: toThreadID,
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
}
