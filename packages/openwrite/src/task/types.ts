import { z } from "zod"

export const TaskType = z.enum(["handoff"])
export type TaskType = z.infer<typeof TaskType>

export const TaskStatus = z.enum(["processing", "success", "fail"])
export type TaskStatus = z.infer<typeof TaskStatus>

export const TaskSource = z.enum(["api", "agent_tool"])
export type TaskSource = z.infer<typeof TaskSource>

export const TaskError = z.object({
  code: z.string(),
  message: z.string(),
})
export type TaskError = z.infer<typeof TaskError>

export const TaskInput = z.record(z.string(), z.any())
export type TaskInput = z.infer<typeof TaskInput>

export const TaskOutput = z.record(z.string(), z.any())
export type TaskOutput = z.infer<typeof TaskOutput>

export const TaskInfo = z.object({
  id: z.string(),
  project_id: z.string(),
  session_id: z.string(),
  type: TaskType,
  status: TaskStatus,
  source: TaskSource,
  created_by_agent: z.string().optional(),
  created_by_run_id: z.string().optional(),
  idempotency_key: z.string(),
  input: TaskInput,
  output: TaskOutput.optional(),
  error: TaskError.optional(),
  time: z.object({
    created: z.number(),
    started: z.number().optional(),
    finished: z.number().optional(),
  }),
})
export type TaskInfo = z.infer<typeof TaskInfo>

export const Task = {
  Type: TaskType,
  Status: TaskStatus,
  Source: TaskSource,
  Error: TaskError,
  Input: TaskInput,
  Output: TaskOutput,
  Info: TaskInfo,
}
