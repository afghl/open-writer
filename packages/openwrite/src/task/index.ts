export { Task } from "./types"
export { TaskStore } from "./store"
export { TaskService } from "./service"
export { TaskRegistry, type TaskHandler } from "./registry"
export { TaskRunner } from "./runner"

import { handoffTaskHandler } from "@/handoff"
import { TaskRegistry } from "./registry"

TaskRegistry.register(handoffTaskHandler)
