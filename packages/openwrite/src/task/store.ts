import { Storage } from "@/storage/storage"
import { Task } from "./types"

type IdempotencyRef = {
  taskID: string
}

export namespace TaskStore {
  export async function write(task: Task.Info) {
    await Storage.write(["task", task.id], task)
    return task
  }

  export async function read(taskID: string) {
    return Storage.read<Task.Info>(["task", taskID])
  }

  export async function list() {
    const segments = await Storage.list(["task"])
    const result = await Promise.all(
      segments.map((item) => Storage.read<Task.Info>(item)),
    )
    result.sort((a, b) => (a.id > b.id ? 1 : -1))
    return result
  }

  export async function listByStatus(status: Task.Status) {
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
}

