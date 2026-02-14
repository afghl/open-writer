export { Task } from "./types"
export {
  TaskType,
  TaskStatus,
  TaskSource,
  TaskError,
  TaskInput,
  TaskOutput,
  TaskInfo,
} from "./types"
export type {
  TaskType as Type,
  TaskStatus as Status,
  TaskSource as Source,
  TaskError as Error,
  TaskInput as Input,
  TaskOutput as Output,
  TaskInfo as Info,
} from "./types"
export { TaskStore } from "./store"
export { TaskService } from "./service"
export { TaskRegistry, type TaskHandler } from "./registry"
export { TaskRunner } from "./runner"

import { handoffTaskHandler } from "@/handoff"
import { register } from "./registry"

register(handoffTaskHandler)
