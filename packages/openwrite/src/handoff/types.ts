import { z } from "zod"
import type { Task } from "@/task/types"

export const HandoffTaskInput = z.object({
  from_run_id: z.string(),
  to_run_id: z.string(),
  target_agent_name: z.string(),
  trigger_message_id: z.string().optional(),
  reason: z.string().optional(),
})
export type HandoffTaskInput = z.infer<typeof HandoffTaskInput>

export const HandoffTaskOutput = z.object({
  handoff_user_message_id: z.string(),
  switched_at: z.number(),
})
export type HandoffTaskOutput = z.infer<typeof HandoffTaskOutput>

export function parseHandoffTaskInput(task: Task.Info): HandoffTaskInput {
  return HandoffTaskInput.parse(task.input)
}

