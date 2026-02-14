import { Identifier } from "@/id"
import type { TaskError, TaskInfo, TaskInput, TaskOutput, TaskSource, TaskType } from "./types"
import { TaskStore } from "./store"

type CreateInput = {
  projectID: string
  sessionID: string
  type: TaskType
  source: TaskSource
  input: TaskInput
  idempotencyKey?: string
  createdByAgent?: string
  createdByRunID?: string
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value !== "object") {
    if (typeof value === "string") return JSON.stringify(value)
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`
}

export function fallbackIdempotencyKey(input: {
  projectID: string
  sessionID: string
  type: TaskType
  payload: TaskInput
}) {
  return [
    input.projectID,
    input.sessionID,
    input.type,
    stableStringify(input.payload),
  ].join(":")
}

export async function createOrGetByIdempotency(input: CreateInput) {
  const idempotencyKey = input.idempotencyKey?.trim()
    || fallbackIdempotencyKey({
      projectID: input.projectID,
      sessionID: input.sessionID,
      type: input.type,
      payload: input.input,
    })
  const existing = await TaskStore.readIdempotency(input.projectID, idempotencyKey)
  if (existing?.taskID) {
    try {
      const task = await TaskStore.read(existing.taskID)
      return {
        created: false,
        task,
      }
    } catch {
      // Continue and recreate if the indexed task is missing.
    }
  }

  const now = Date.now()
  const task: TaskInfo = {
    id: Identifier.ascending("task"),
    project_id: input.projectID,
    session_id: input.sessionID,
    type: input.type,
    status: "processing",
    source: input.source,
    created_by_agent: input.createdByAgent,
    created_by_run_id: input.createdByRunID,
    idempotency_key: idempotencyKey,
    input: input.input,
    time: {
      created: now,
    },
  }
  await TaskStore.write(task)
  await TaskStore.writeIdempotency(input.projectID, idempotencyKey, task.id)
  return {
    created: true,
    task,
  }
}

export async function get(taskID: string) {
  return TaskStore.read(taskID)
}

export async function markStarted(taskID: string) {
  const current = await TaskStore.read(taskID)
  if (current.status !== "processing") {
    return current
  }
  if (current.time.started) {
    return current
  }
  const next: TaskInfo = {
    ...current,
    time: {
      ...current.time,
      started: Date.now(),
    },
  }
  await TaskStore.write(next)
  return next
}

export async function markSuccess(taskID: string, output: TaskOutput) {
  const current = await TaskStore.read(taskID)
  const next: TaskInfo = {
    ...current,
    status: "success",
    output,
    error: undefined,
    time: {
      ...current.time,
      finished: Date.now(),
    },
  }
  await TaskStore.write(next)
  return next
}

export async function markFail(taskID: string, error: TaskError) {
  const current = await TaskStore.read(taskID)
  const next: TaskInfo = {
    ...current,
    status: "fail",
    error,
    output: undefined,
    time: {
      ...current.time,
      finished: Date.now(),
    },
  }
  await TaskStore.write(next)
  return next
}

export async function listProcessing() {
  return TaskStore.listByStatus("processing")
}

export const TaskService = {
  fallbackIdempotencyKey,
  createOrGetByIdempotency,
  get,
  markStarted,
  markSuccess,
  markFail,
  listProcessing,
}
