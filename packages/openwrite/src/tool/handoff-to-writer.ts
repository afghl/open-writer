import z from "zod"
import { Identifier } from "@/id/id"
import { Project } from "@/project"
import { TaskRunner, TaskService } from "@/task"
import { Tool } from "./tool"

const DESCRIPTION = "Create a handoff task from plan to writer."

export const HandoffToWriterTool = Tool.define("handoff_to_writer", async () => ({
  description: DESCRIPTION,
  parameters: z.object({
    reason: z
      .string()
      .min(1)
      .describe("Why the plan is ready to handoff to writer."),
  }),
  async execute(params, ctx) {
    if (ctx.agent !== "plan") {
      throw new Error("Only the plan agent can create handoff tasks.")
    }

    const project = await Project.get(ctx.projectID)
    const sessionID = project.curr_session_id
    if (!sessionID) {
      throw new Error("Current project has no active session.")
    }

    const fromRunID = project.curr_run_id || project.root_run_id || ctx.runID
    const toRunID = Identifier.ascending("run")
    const payload = {
      from_run_id: fromRunID,
      to_run_id: toRunID,
      target_agent_name: "writer",
      trigger_message_id: ctx.messageID,
      reason: params.reason.trim(),
    }
    const result = await TaskService.createOrGetByIdempotency({
      projectID: ctx.projectID,
      sessionID,
      type: "handoff",
      source: "agent_tool",
      createdByAgent: ctx.agent,
      createdByRunID: ctx.runID,
      input: payload,
      idempotencyKey: TaskService.fallbackIdempotencyKey({
        projectID: ctx.projectID,
        sessionID,
        type: "handoff",
        payload: {
          ...payload,
          to_run_id: "__next_run__",
        },
      }),
    })
    TaskRunner.kick()

    return {
      title: "Handoff task created",
      metadata: {
        taskID: result.task.id,
        created: result.created,
        status: result.task.status,
        targetAgentName: "writer",
      },
      output: JSON.stringify({
        task_id: result.task.id,
        status: result.task.status,
        created: result.created,
      }),
    }
  },
}))

