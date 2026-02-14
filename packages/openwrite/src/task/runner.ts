import { Session } from "@/session"
import { Log } from "@/util"
import { TaskRegistry } from "./registry"
import { TaskService } from "./service"
import type { TaskInfo } from "./types"

const POLL_INTERVAL_MS = 1_000
const TASK_TIMEOUT_MS = 300_000

const log = Log.create({ service: "task.runner" })
let timer: ReturnType<typeof setInterval> | undefined
let running = false
let queued = false

export function start() {
  if (timer) return
  timer = setInterval(() => {
    kick()
  }, POLL_INTERVAL_MS)
  kick()
}

export function stop() {
  if (!timer) return
  clearInterval(timer)
  timer = undefined
}

export function kick() {
  if (running) {
    queued = true
    return
  }
  void runLoop()
}

async function runLoop() {
  if (running) return
  running = true
  try {
    do {
      queued = false
      await runOnce()
    } while (queued)
  } finally {
    running = false
  }
}

function stale(task: TaskInfo, now = Date.now()) {
  const started = task.time.started ?? task.time.created
  return now - started > TASK_TIMEOUT_MS
}

async function runOnce() {
  const processing = await TaskService.listProcessing()
  for (const task of processing) {
    try {
      if (stale(task)) {
        await TaskService.markFail(task.id, {
          code: "TASK_TIMEOUT",
          message: `Task timed out after ${TASK_TIMEOUT_MS}ms`,
        })
        await Session.releaseTaskStatus(task.session_id, task.id)
        continue
      }
      await runTask(task)
    } catch (error) {
      log.error("Task scan failed", { taskID: task.id, error })
      try {
        await TaskService.markFail(task.id, {
          code: "TASK_SCAN_FAILED",
          message: error instanceof Error ? error.message : String(error),
        })
      } catch {
        // Keep polling loop alive even if storage is unavailable.
      }
    }
  }
}

async function runTask(task: TaskInfo) {
  let locked = false
  try {
    const lock = await Session.transitionStatus({
      sessionID: task.session_id,
      from: ["idle"],
      to: "handoff_processing",
      activeTaskID: task.id,
    })
    if (!lock.changed) {
      return
    }
    locked = true
    await TaskService.markStarted(task.id)
    const handler = TaskRegistry.get(task.type)
    if (!handler) {
      throw new Error(`No task handler registered for type: ${task.type}`)
    }
    const output = await handler.execute(task)
    await TaskService.markSuccess(task.id, output)
  } catch (error) {
    log.error("Task execution failed", { taskID: task.id, error })
    await TaskService.markFail(task.id, {
      code: "TASK_EXECUTION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    if (locked) {
      await Session.releaseTaskStatus(task.session_id, task.id)
    }
  }
}

export const TaskRunner = {
  start,
  stop,
  kick,
}
