#!/usr/bin/env bun
import { parseArgs } from "node:util"
import { config as loadEnv } from "dotenv"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

function usage() {
  console.log(
    [
      "Usage:",
      "  bun run scripts/search-agent.ts --project <project_id> --query \"...\" [options]",
      "  bun run scripts/search-agent.ts --project <project_id> \"query as positional\"",
      "",
      "Options:",
      "  --project <id>          Project ID (or set OW_PROJECT_ID)",
      "  --query <text>          Search query text",
      "  --base-url <url>        OpenWrite API base URL (default: OW_API_BASE or http://127.0.0.1:3000)",
      "  --token <token>         Proxy token (default: OW_PROXY_TOKEN or dev-openwrite-proxy-token)",
      "  --k <n>                 Candidate limit (1..50)",
      "  --max-steps <n>         Search agent max steps hint (1..20)",
      "  --scope-path <path>     Scope path under inputs/library (repeatable)",
      "  --scope-ext <ext>       Scope extension (repeatable), e.g. md or .md",
      "  --raw                   Print raw JSON response",
      "  --help                  Show this help",
      "",
      "Examples:",
      "  bun run scripts/search-agent.ts --project project_123 --query \"RAG chunking strategy\"",
      "  bun run scripts/search-agent.ts --project project_123 --scope-path inputs/library/docs --scope-ext md \"BM25 vs vector\"",
    ].join("\n"),
  )
}

function toList(value: string | string[] | undefined) {
  if (!value) return [] as string[]
  return Array.isArray(value) ? value : [value]
}

function parseOptionalInt(
  raw: string | undefined,
  name: string,
  min: number,
  max: number,
) {
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}], got: ${raw}`)
  }
  return parsed
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
loadEnv({
  path: resolve(scriptDir, "../packages/openwrite/.env"),
  quiet: true,
})

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    help: { type: "boolean" },
    query: { type: "string" },
    project: { type: "string" },
    token: { type: "string" },
    "base-url": { type: "string" },
    k: { type: "string" },
    "max-steps": { type: "string" },
    "scope-path": { type: "string", multiple: true },
    "scope-ext": { type: "string", multiple: true },
    raw: { type: "boolean" },
  },
})

if (values.help) {
  usage()
  process.exit(0)
}

const query = (values.query ?? positionals.join(" ")).trim()
if (!query) {
  console.error("Missing query. Use --query or provide a positional query string.")
  usage()
  process.exit(1)
}

const projectID = (values.project ?? process.env.OW_PROJECT_ID ?? "").trim()
if (!projectID) {
  console.error("Missing project ID. Use --project or set OW_PROJECT_ID.")
  process.exit(1)
}

const baseURL = (values["base-url"] ?? process.env.OW_API_BASE ?? "http://127.0.0.1:3000")
  .trim()
  .replace(/\/+$/, "")
const proxyToken = (values.token ?? process.env.OW_PROXY_TOKEN ?? "dev-openwrite-proxy-token").trim()

let k: number | undefined
let maxSteps: number | undefined
try {
  k = parseOptionalInt(values.k, "k", 1, 50)
  maxSteps = parseOptionalInt(values["max-steps"], "max-steps", 1, 20)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const scopePaths = toList(values["scope-path"])
  .map((item) => item.trim())
  .filter((item) => item.length > 0)
const scopeExtensions = toList(values["scope-ext"])
  .map((item) => item.trim())
  .filter((item) => item.length > 0)

const requestBody: Record<string, unknown> = { query }
if (k !== undefined) requestBody.k = k
if (maxSteps !== undefined) requestBody.max_steps = maxSteps
if (scopePaths.length > 0 || scopeExtensions.length > 0) {
  requestBody.scope = {
    ...(scopePaths.length > 0 ? { paths: scopePaths } : {}),
    ...(scopeExtensions.length > 0 ? { extensions: scopeExtensions } : {}),
  }
}

const endpoint = `${baseURL}/api/search-agent/thread`
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-ow-proxy-token": proxyToken,
    "x-project-id": projectID,
  },
  body: JSON.stringify(requestBody),
})

const rawText = await response.text()
let payload: unknown
try {
  payload = JSON.parse(rawText)
} catch {
  payload = rawText
}

if (!response.ok) {
  console.error(`Request failed: ${response.status} ${response.statusText}`)
  console.error(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2))
  process.exit(1)
}

if (values.raw) {
  console.log(JSON.stringify(payload, null, 2))
  process.exit(0)
}

type SearchAgentResponse = {
  session_id?: string
  assistant_message_id?: string
  report_markdown?: string
  tool_trace?: Array<{ tool?: string; status?: string; title?: string }>
}

const result = (payload ?? {}) as SearchAgentResponse

if (result.session_id) {
  console.log(`session_id: ${result.session_id}`)
}
if (result.assistant_message_id) {
  console.log(`assistant_message_id: ${result.assistant_message_id}`)
}

if (Array.isArray(result.tool_trace) && result.tool_trace.length > 0) {
  console.log("\ntool_trace:")
  for (const item of result.tool_trace) {
    const tool = item.tool ?? "unknown"
    const status = item.status ?? "unknown"
    const title = item.title ? ` (${item.title})` : ""
    console.log(`- ${tool}: ${status}${title}`)
  }
}

console.log("\nreport_markdown:\n")
console.log(result.report_markdown ?? "")
