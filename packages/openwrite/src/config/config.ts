import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

function findEnv(start: string) {
  let dir = start
  while (true) {
    const file = path.join(dir, ".env")
    if (existsSync(file)) return file
    const parent = path.dirname(dir)
    if (parent === dir) return
    dir = parent
  }
}

function parseEnv(text: string) {
  const env: Record<string, string> = {}
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const index = trimmed.indexOf("=")
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

const explicitPath = process.env.OPENWRITE_ENV_PATH
const packageRoot = path.resolve(import.meta.dir, "..", "..")
const envPath = explicitPath ?? findEnv(process.cwd()) ?? findEnv(packageRoot)
const env = envPath ? parseEnv(readFileSync(envPath, "utf8")) : {}

for (const [key, value] of Object.entries(env)) {
  if (process.env[key] === undefined) process.env[key] = value
}

export function getEnv(key: string, fallback?: string) {
  const value = env[key] ?? process.env[key]
  if (value !== undefined) return value
  return fallback
}

export const config = {
  envPath,
  env,
}
