import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useRenderer } from "@opentui/react"
import { useEffect, useMemo, useState } from "react"

const DEFAULT_API_BASE = "http://127.0.0.1:3000"
const MAX_VISIBLE_CHAT_LINES = 18
const MAX_VISIBLE_SSE_LINES = 18

type ChatRole = "system" | "user" | "assistant"

type ChatLine = {
  id: string
  role: ChatRole
  text: string
}

type SseLine = {
  id: string
  text: string
}

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
  const [inputValue, setInputValue] = useState("")
  const [sending, setSending] = useState(false)
  const [sseLines, setSseLines] = useState<SseLine[]>([])
  const [lines, setLines] = useState<ChatLine[]>([
    { id: nextLineID(), role: "system", text: `Connecting to ${apiBase}...` },
  ])

  const pushLine = (role: ChatRole, text: string) => {
    setLines((prev) => [...prev, { id: nextLineID(), role, text }])
  }
  const pushSseLine = (text: string) => {
    setSseLines((prev) => appendSseLine(prev, text))
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
    const text = inputValue.trim()
    if (!text || sending) return
    if (!projectID) {
      pushLine("system", "Project is not ready yet.")
      return
    }

    setInputValue("")
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

  useKeyboard((key) => {
    if (key.name === "escape") {
      renderer.destroy()
      return
    }
    if (key.name === "enter" || key.name === "return") {
      void handleSend()
    }
  })

  const visible = lines.slice(-MAX_VISIBLE_CHAT_LINES)
  const visibleSse = sseLines.slice(-MAX_VISIBLE_SSE_LINES)

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} gap={1}>
      <text>open-write tui (enter=send, esc=quit) project={projectID || "-"}</text>
      <box flexDirection="row" flexGrow={1} gap={1}>
        <box border padding={1} flexDirection="column" flexGrow={1}>
          <text>[chat]</text>
          {visible.map((line) => (
            <text key={line.id}>
              [{line.role}] {line.text}
            </text>
          ))}
        </box>
        <box border padding={1} flexDirection="column" flexGrow={1}>
          <text>[sse]</text>
          {visibleSse.map((line) => (
            <text key={line.id}>{line.text}</text>
          ))}
        </box>
      </box>
      <input
        value={inputValue}
        onChange={setInputValue}
        placeholder={sending ? "waiting for assistant..." : "type a message and press Enter"}
        focused
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
