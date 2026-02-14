import type { TaskInfo, TaskOutput, TaskType } from "./types"

export type TaskHandler = {
  type: TaskType
  execute(task: TaskInfo): Promise<TaskOutput>
}

const handlers = new Map<TaskType, TaskHandler>()

export function register(handler: TaskHandler) {
  handlers.set(handler.type, handler)
}

export function get(type: TaskType) {
  return handlers.get(type)
}

export const TaskRegistry = {
  register,
  get,
}

