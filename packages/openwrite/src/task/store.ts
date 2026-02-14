import { Storage } from "@/storage"
import type { TaskInfo, TaskStatus } from "./types"

type IdempotencyRef = {
  taskID: string
}

export async function write(task: TaskInfo) {
  await Storage.write(["task", task.id], task)
  return task
}

export async function read(taskID: string) {
  return Storage.read<TaskInfo>(["task", taskID])
}

export async function list() {
  const segments = await Storage.list(["task"])
  const result = await Promise.all(
    segments.map((item) => Storage.read<TaskInfo>(item)),
  )
  result.sort((a, b) => (a.id > b.id ? 1 : -1))
  return result
}

export async function listByStatus(status: TaskStatus) {
  const items = await list()
  return items.filter((item) => item.status === status)
}

export async function writeIdempotency(projectID: string, idempotencyKey: string, taskID: string) {
  await Storage.write(["task_idempotency", projectID, idempotencyKey], { taskID } satisfies IdempotencyRef)
}

export async function readIdempotency(projectID: string, idempotencyKey: string) {
  try {
    return await Storage.read<IdempotencyRef>(["task_idempotency", projectID, idempotencyKey])
  } catch {
    return undefined
  }
}

export const TaskStore = {
  write,
  read,
  list,
  listByStatus,
  writeIdempotency,
  readIdempotency,
}

