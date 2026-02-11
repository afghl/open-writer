import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useRenderer } from "@opentui/react"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { useEffect, useMemo, useState } from "react"

const DEFAULT_API_BASE = "http://127.0.0.1:3000"
const MAX_VISIBLE_CHAT_LINES = 18
const MAX_VISIBLE_SSE_LINES = 18
const MAX_VISIBLE_CURL_LINES = 18
const CURL_COMMAND_TIMEOUT_MS = 30_000

type ChatRole = "system" | "user" | "assistant"
type FocusTarget = "chat" | "curl"
type CurlOutputMode = "print" | "save"

type ChatLine = {
  id: string
  role: ChatRole
  text: string
}

type SseLine = {
  id: string
  text: string
}

const CURL_SHORT_OPTIONS_WITH_VALUE = new Set([
  "-A",
  "-b",
  "-c",
  "-d",
  "-e",
  "-E",
  "-F",
  "-H",
  "-K",
  "-m",
  "-o",
  "-T",
  "-u",
  "-U",
  "-w",
  "-x",
  "-X",
])

const CURL_LONG_OPTIONS_WITH_VALUE = new Set([
  "--cert",
  "--cacert",
  "--config",
  "--connect-timeout",
  "--connect-to",
  "--cookie",
  "--cookie-jar",
  "--data",
  "--data-ascii",
  "--data-binary",
  "--data-raw",
  "--form",
  "--header",
  "--interface",
  "--json",
  "--key",
  "--max-time",
  "--output",
  "--proxy",
  "--proxy-user",
  "--range",
  "--referer",
  "--request",
  "--request-target",
  "--resolve",
  "--retry",
  "--retry-delay",
  "--retry-max-time",
  "--upload-file",
  "--url",
  "--user",
  "--user-agent",
  "--write-out",
])

function nextLineID() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function normalizeSseError(error: unknown) {
  const message = toErrorMessage(error)
  if (message.includes("socket connection was closed unexpectedly")) {
    return "socket closed unexpectedly"
  }
  return message
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined
  return value as Record<string, unknown>
}

async function createProject(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/project`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  })
  if (!response.ok) {
    throw new Error(`Create project failed: HTTP ${response.status}`)
  }

  const data = asObject(await response.json())
  const project = asObject(data?.project)
  const projectID = project?.id
  if (typeof projectID !== "string" || projectID.length === 0) {
    throw new Error("Create project failed: missing project id in response")
  }
  return projectID
}

function appendSseLine(lines: SseLine[], text: string) {
  return [...lines, { id: nextLineID(), text }].slice(-MAX_VISIBLE_SSE_LINES * 4)
}

function appendCurlLine(lines: SseLine[], text: string) {
  return [...lines, { id: nextLineID(), text }].slice(-MAX_VISIBLE_CURL_LINES * 4)
}

function splitShellCommand(command: string) {
  const tokens: string[] = []
  let current = ""
  let quote: '"' | "'" | null = null
  let escaped = false

  for (const char of command) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ""
      }
      continue
    }
    current += char
  }

  if (escaped) {
    throw new Error("Invalid curl command: trailing escape")
  }
  if (quote) {
    throw new Error("Invalid curl command: unterminated quote")
  }
  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

function normalizeCurlArgs(rawArgs: string[], apiBase: string) {
  const args = [...rawArgs]
  let explicitUrlIndex = -1
  const consumedValueIndices = new Set<number>()

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]

    if (token === "--url") {
      if (index + 1 >= args.length) {
        throw new Error("Invalid curl command: --url requires a value")
      }
      explicitUrlIndex = index + 1
      consumedValueIndices.add(index + 1)
      index += 1
      continue
    }

    if (token.startsWith("--url=")) {
      const value = token.slice("--url=".length)
      if (value.startsWith("/")) {
        args[index] = `--url=${apiBase}${value}`
      }
      return args
    }

    if (CURL_LONG_OPTIONS_WITH_VALUE.has(token)) {
      if (index + 1 >= args.length) {
        throw new Error(`Invalid curl command: ${token} requires a value`)
      }
      consumedValueIndices.add(index + 1)
      index += 1
      continue
    }

    if (token.length === 2 && CURL_SHORT_OPTIONS_WITH_VALUE.has(token)) {
      if (index + 1 >= args.length) {
        throw new Error(`Invalid curl command: ${token} requires a value`)
      }
      consumedValueIndices.add(index + 1)
      index += 1
    }
  }

  if (explicitUrlIndex >= 0) {
    const value = args[explicitUrlIndex]
    if (value.startsWith("/")) {
      args[explicitUrlIndex] = `${apiBase}${value}`
    }
    return args
  }

  let fallbackUrlIndex = -1
  for (let index = 0; index < args.length; index += 1) {
    if (consumedValueIndices.has(index)) continue
    const token = args[index]
    if (!token.startsWith("-")) {
      fallbackUrlIndex = index
    }
  }

  if (fallbackUrlIndex >= 0 && args[fallbackUrlIndex].startsWith("/")) {
    args[fallbackUrlIndex] = `${apiBase}${args[fallbackUrlIndex]}`
  }

  return args
}

function buildCurlCommand(rawCommand: string, apiBase: string) {
  const command = rawCommand.trim()
  if (!command) {
    throw new Error("curl command is empty")
  }

  const tokens = splitShellCommand(command)
  if (tokens.length === 0 || tokens[0] !== "curl") {
    throw new Error("Command must start with curl")
  }

  return ["curl", ...normalizeCurlArgs(tokens.slice(1), apiBase)]
}

type CurlCommandResult = {
  exitCode: number
  stderr: string
  stdout: string
}

async function runCurlCommand(rawCommand: string, apiBase: string): Promise<CurlCommandResult> {
  const command = buildCurlCommand(rawCommand, apiBase)
  const proc = Bun.spawn({
    cmd: command,
    stderr: "pipe",
    stdout: "pipe",
  })

  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, CURL_COMMAND_TIMEOUT_MS)

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (timedOut) {
      throw new Error(`curl timed out after ${CURL_COMMAND_TIMEOUT_MS / 1000}s`)
    }
    return { exitCode, stderr, stdout }
  } finally {
    clearTimeout(timeout)
  }
}

function splitPrintableLines(text: string) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.length > 0)
}

async function saveCurlResponseToTempFile(content: string) {
  const path = join(tmpdir(), `openwrite-curl-${nextLineID()}.txt`)
  await Bun.write(path, content)
  return path
}

function decodeSseData(data: string) {
  try {
    const parsed = JSON.parse(data) as unknown
    return JSON.stringify(parsed)
  } catch {
    return data
  }
}

async function streamProjectEvents(
  baseUrl: string,
  projectID: string,
  signal: AbortSignal,
  onEvent: (line: string) => void,
) {
  const response = await fetch(`${baseUrl}/event`, {
    method: "GET",
    headers: {
      "accept": "text/event-stream",
      "x-project-id": projectID,
    },
    signal,
  })
  if (!response.ok) {
    throw new Error(`SSE connect failed: HTTP ${response.status}`)
  }
  if (!response.body) {
    throw new Error("SSE connect failed: missing response body")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventName = "message"
  let dataLines: string[] = []

  const flushEvent = () => {
    if (dataLines.length === 0) return
    if (eventName === "ping") {
      eventName = "message"
      dataLines = []
      return
    }
    const payload = decodeSseData(dataLines.join("\n"))
    onEvent(`[${eventName}] ${payload}`)
    eventName = "message"
    dataLines = []
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    while (true) {
      const newlineIndex = buffer.indexOf("\n")
      if (newlineIndex === -1) break

      const rawLine = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine

      if (line.length === 0) {
        flushEvent()
        continue
      }
      if (line.startsWith(":")) continue
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim() || "message"
        continue
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart())
      }
    }
  }

  flushEvent()
}

async function waitForRetry(delayMs: number, signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, delayMs)

    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException("Aborted", "AbortError"))
    }

    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function extractAssistantText(payload: unknown): string {
  const root = asObject(payload)
  const message = asObject(root?.message)
  const parts = message?.parts
  if (!Array.isArray(parts)) return ""

  const chunks: string[] = []
  for (const partValue of parts) {
    const part = asObject(partValue)
    if (!part) continue
    if (part.type !== "text") continue
    if (typeof part.text !== "string") continue
    if (part.text.length === 0) continue
    chunks.push(part.text)
  }
  return chunks.join("").trim()
}

async function sendMessage(baseUrl: string, projectID: string, text: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/message`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-project-id": projectID,
    },
    body: JSON.stringify({ text }),
  })
  if (!response.ok) {
    throw new Error(`Send message failed: HTTP ${response.status}`)
  }

  const payload = await response.json()
  const assistantText = extractAssistantText(payload)
  if (!assistantText) return "[assistant returned no text]"
  return assistantText
}

function App() {
  const renderer = useRenderer()
  const apiBase = useMemo(() => process.env.OPENWRITE_API_BASE ?? DEFAULT_API_BASE, [])
  const configuredProjectID = useMemo(() => process.env.OPENWRITE_PROJECT_ID?.trim() ?? "", [])

  const [projectID, setProjectID] = useState<string>("")
  const [chatInputValue, setChatInputValue] = useState("")
  const [focusTarget, setFocusTarget] = useState<FocusTarget>("chat")
  const [sending, setSending] = useState(false)
  const [sseLines, setSseLines] = useState<SseLine[]>([])
  const [curlInputValue, setCurlInputValue] = useState("")
  const [curlOutputMode, setCurlOutputMode] = useState<CurlOutputMode>("print")
  const [runningCurl, setRunningCurl] = useState(false)
  const [curlLines, setCurlLines] = useState<SseLine[]>([])
  const [lines, setLines] = useState<ChatLine[]>([
    { id: nextLineID(), role: "system", text: `Connecting to ${apiBase}...` },
  ])

  const pushLine = (role: ChatRole, text: string) => {
    setLines((prev) => [...prev, { id: nextLineID(), role, text }])
  }
  const pushSseLine = (text: string) => {
    setSseLines((prev) => appendSseLine(prev, text))
  }
  const pushCurlLine = (text: string) => {
    setCurlLines((prev) => appendCurlLine(prev, text))
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (configuredProjectID) {
          if (!active) return
          setProjectID(configuredProjectID)
          pushLine("system", `Using configured project=${configuredProjectID}`)
          return
        }

        const id = await createProject(apiBase)
        if (!active) return
        setProjectID(id)
        pushLine("system", `Ready. project=${id}`)
      } catch (error) {
        if (!active) return
        pushLine("system", `Init failed: ${toErrorMessage(error)}`)
      }
    })()

    return () => {
      active = false
    }
  }, [apiBase, configuredProjectID])

  useEffect(() => {
    if (!projectID) return

    const controller = new AbortController()
    pushSseLine(`connecting to ${apiBase}/event (project=${projectID})`)

    void (async () => {
      let attempt = 0
      while (!controller.signal.aborted) {
        attempt += 1
        if (attempt > 1) {
          pushSseLine(`reconnecting (attempt ${attempt})...`)
        }

        try {
          await streamProjectEvents(apiBase, projectID, controller.signal, pushSseLine)
          if (controller.signal.aborted) return
          pushSseLine("stream ended, retrying...")
        } catch (error) {
          if (controller.signal.aborted) return
          pushSseLine(`stream error: ${normalizeSseError(error)}; retrying...`)
        }

        const delay = Math.min(5000, 500 * attempt)
        try {
          await waitForRetry(delay, controller.signal)
        } catch {
          return
        }
      }
    })()

    return () => {
      controller.abort()
    }
  }, [apiBase, projectID])

  const handleSend = async () => {
    const text = chatInputValue.trim()
    if (!text || sending) return
    if (!projectID) {
      pushLine("system", "Project is not ready yet.")
      return
    }

    setChatInputValue("")
    setSending(true)
    pushLine("user", text)
    try {
      const response = await sendMessage(apiBase, projectID, text)
      pushLine("assistant", response)
    } catch (error) {
      pushLine("system", `Request failed: ${toErrorMessage(error)}`)
    } finally {
      setSending(false)
    }
  }

  const handleRunCurl = async () => {
    const command = curlInputValue.trim()
    if (!command || runningCurl) return

    setCurlInputValue("")
    setRunningCurl(true)
    pushCurlLine(`$ ${command}`)
    try {
      const result = await runCurlCommand(command, apiBase)
      const stderrLines = splitPrintableLines(result.stderr)
      for (const line of stderrLines) {
        pushCurlLine(`[stderr] ${line}`)
      }

      if (curlOutputMode === "print") {
        const stdoutLines = splitPrintableLines(result.stdout)
        if (stdoutLines.length === 0) {
          pushCurlLine("[stdout] <empty>")
        } else {
          for (const line of stdoutLines) {
            pushCurlLine(`[stdout] ${line}`)
          }
        }
      } else {
        const outputPath = await saveCurlResponseToTempFile(result.stdout)
        pushCurlLine(`saved response to ${outputPath}`)
      }

      if (result.exitCode !== 0) {
        pushCurlLine(`curl exited with code ${result.exitCode}`)
      } else {
        pushCurlLine("curl done")
      }
    } catch (error) {
      pushCurlLine(`curl failed: ${toErrorMessage(error)}`)
    } finally {
      setRunningCurl(false)
    }
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      renderer.destroy()
      return
    }

    if (key.name === "tab") {
      setFocusTarget((prev) => (prev === "chat" ? "curl" : "chat"))
      return
    }

    if (key.ctrl && key.name === "p") {
      setCurlOutputMode("print")
      pushCurlLine("curl mode -> print")
      return
    }

    if (key.ctrl && key.name === "s") {
      setCurlOutputMode("save")
      pushCurlLine("curl mode -> save")
      return
    }

    if (key.name === "enter" || key.name === "return") {
      if (focusTarget === "chat") {
        void handleSend()
      } else {
        void handleRunCurl()
      }
    }
  })

  const visible = lines.slice(-MAX_VISIBLE_CHAT_LINES)
  const visibleSse = sseLines.slice(-MAX_VISIBLE_SSE_LINES)
  const visibleCurl = curlLines.slice(-MAX_VISIBLE_CURL_LINES)

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} gap={1}>
      <text>
        open-write tui (tab=switch input, enter=send/run, ctrl+p=print, ctrl+s=save, esc=quit)
        project={projectID || "-"}
      </text>
      <box flexDirection="row" flexGrow={1} gap={1}>
        <box border padding={1} flexDirection="column" flexGrow={1}>
          <text>[chat]</text>
          {visible.map((line) => (
            <text key={line.id}>
              [{line.role}] {line.text}
            </text>
          ))}
        </box>
        <box flexDirection="column" flexGrow={1} gap={1}>
          <box border padding={1} flexDirection="column" flexGrow={1}>
            <text>[sse]</text>
            {visibleSse.map((line) => (
              <text key={line.id}>{line.text}</text>
            ))}
          </box>
          <box border padding={1} flexDirection="column" flexGrow={1} gap={1}>
            <text>[curl] mode={curlOutputMode} focus={focusTarget === "curl" ? "active" : "inactive"}</text>
            {visibleCurl.map((line) => (
              <text key={line.id}>{line.text}</text>
            ))}
            <input
              value={curlInputValue}
              onChange={setCurlInputValue}
              placeholder={
                runningCurl
                  ? "running curl..."
                  : `curl ${apiBase}/api/project -X POST -H "content-type: application/json" -d "{}"`
              }
              focused={focusTarget === "curl"}
            />
          </box>
        </box>
      </box>
      <input
        value={chatInputValue}
        onChange={setChatInputValue}
        placeholder={sending ? "waiting for assistant..." : "type a message and press Enter"}
        focused={focusTarget === "chat"}
      />
    </box>
  )
}

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })
  createRoot(renderer).render(<App />)
}

main().catch((error) => {
  console.error(error)
})
