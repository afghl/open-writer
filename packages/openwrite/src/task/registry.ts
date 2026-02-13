import { Task } from "./types"

export type TaskHandler = {
  type: Task.Type
  execute(task: Task.Info): Promise<Task.Output>
}

export namespace TaskRegistry {
  const handlers = new Map<Task.Type, TaskHandler>()

  export function register(handler: TaskHandler) {
    handlers.set(handler.type, handler)
  }

  export function get(type: Task.Type) {
    return handlers.get(type)
  }
}

