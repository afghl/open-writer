import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@/global"
import z from "zod"

export const LogLevel = z.enum(["DEBUG", "INFO", "WARN", "ERROR"])
export type LogLevel = z.infer<typeof LogLevel>

const levelPriority: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}
const KEEP_LOG_FILES = 10

let level: LogLevel = "INFO"

function shouldLog(input: LogLevel): boolean {
  return levelPriority[input] >= levelPriority[level]
}

type LogExtra = Record<string, unknown>

export type Logger = {
  debug(message?: unknown, extra?: LogExtra): void
  info(message?: unknown, extra?: LogExtra): void
  error(message?: unknown, extra?: LogExtra): void
  warn(message?: unknown, extra?: LogExtra): void
  tag(key: string, value: string): Logger
  clone(): Logger
  time(
    message: string,
    extra?: LogExtra,
  ): {
    stop(): void
    [Symbol.dispose](): void
  }
}

const loggers = new Map<string, Logger>()

export interface LogOptions {
  print: boolean
  dev?: boolean
  level?: LogLevel
}

let logpath = ""
export function file() {
  return logpath
}
let write = (msg: string) => {
  process.stderr.write(msg)
}

export async function init(options: LogOptions) {
  if (options.level) level = options.level
  void cleanup(Global.Path.log)
  if (options.print) {
    logpath = ""
    write = (msg: string) => {
      process.stderr.write(msg)
    }
    return
  }

  logpath = path.join(
    Global.Path.log,
    options.dev ? "dev.log" : new Date().toISOString().split(".")[0].replace(/:/g, "") + ".log",
  )
  const logfile = Bun.file(logpath)
  await fs.truncate(logpath).catch(() => { })
  const writer = logfile.writer()
  write = (msg: string) => {
    writer.write(msg)
    writer.flush()
  }
}

async function cleanup(dir: string) {
  const glob = new Bun.Glob("????-??-??T??????.log")
  const files = await Array.fromAsync(
    glob.scan({
      cwd: dir,
      absolute: true,
    }),
  )
  if (files.length <= KEEP_LOG_FILES) return

  const filesToDelete = [...files]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, files.length - KEEP_LOG_FILES)
  await Promise.all(filesToDelete.map((file) => fs.unlink(file).catch(() => { })))
}

function formatError(error: Error, depth = 0): string {
  const result = error.message
  return error.cause instanceof Error && depth < 10
    ? result + " Caused by: " + formatError(error.cause, depth + 1)
    : result
}

function formatValue(value: unknown): string {
  if (value instanceof Error) return formatError(value)
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value)
    } catch {
      return "[unserializable]"
    }
  }
  return String(value)
}

let last = Date.now()
export function create(tags?: LogExtra) {
  tags = tags || {}

  const service = tags["service"]
  if (service && typeof service === "string") {
    const cached = loggers.get(service)
    if (cached) {
      return cached
    }
  }

  function build(message: unknown, extra?: LogExtra) {
    const prefix = Object.entries({
      ...tags,
      ...extra,
    })
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        return `${key}=${formatValue(value)}`
      })
      .join(" ")
    const next = new Date()
    const diff = next.getTime() - last
    last = next.getTime()
    const output = message === undefined || message === null ? "" : formatValue(message)
    return [next.toISOString().split(".")[0], "+" + diff + "ms", prefix, output]
      .filter((part) => part.length > 0)
      .join(" ") + "\n"
  }
  const result: Logger = {
    debug(message?: unknown, extra?: LogExtra) {
      if (shouldLog("DEBUG")) {
        write("DEBUG " + build(message, extra))
      }
    },
    info(message?: unknown, extra?: LogExtra) {
      if (shouldLog("INFO")) {
        write("INFO  " + build(message, extra))
      }
    },
    error(message?: unknown, extra?: LogExtra) {
      if (shouldLog("ERROR")) {
        write("ERROR " + build(message, extra))
      }
    },
    warn(message?: unknown, extra?: LogExtra) {
      if (shouldLog("WARN")) {
        write("WARN  " + build(message, extra))
      }
    },
    tag(key: string, value: string) {
      if (tags) tags[key] = value
      return result
    },
    clone() {
      return create({ ...tags })
    },
    time(message: string, extra?: LogExtra) {
      const now = Date.now()
      result.info(message, { status: "started", ...extra })
      function stop() {
        result.info(message, {
          status: "completed",
          duration: Date.now() - now,
          ...extra,
        })
      }
      return {
        stop,
        [Symbol.dispose]() {
          stop()
        },
      }
    }
  }

  if (service && typeof service === "string") {
    loggers.set(service, result)
  }

  return result
}

export const Default = create({ service: "default" })

export const Log = {
  Level: LogLevel,
  Default,
  file,
  init,
  create,
}
