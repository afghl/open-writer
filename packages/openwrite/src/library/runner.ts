import { Log } from "@/util/log"
import { LibraryImportService } from "./service"

const POLL_INTERVAL_MS = 1_000

const log = Log.create({ service: "library.runner" })
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

async function runOnce() {
  const pending = await LibraryImportService.listPendingImports()
  for (const item of pending) {
    try {
      await LibraryImportService.processImport(item)
    } catch (error) {
      log.error("Library import failed in runner", {
        importID: item.id,
        projectID: item.project_id,
        error,
      })
    }
  }
}

export const LibraryImportRunner = {
  start,
  stop,
  kick,
}
