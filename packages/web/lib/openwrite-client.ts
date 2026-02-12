export type OpenwriteProject = {
  id: string
  project_slug: string
  title: string
  curr_session_id: string
  curr_agent_name: string
  phase: "planning" | "writing"
  time: {
    created: number
    updated: number
  }
}

export type OpenwriteFsNode = {
  name: string
  path: string
  kind: "file" | "dir"
  size: number
  mtimeMs: number
  children?: OpenwriteFsNode[]
}

export type OpenwriteFsReadResult = {
  path: string
  content: string
  totalLines: number
  truncated: boolean
  offset: number
  limit: number
}

export type OpenwriteMessageInfo =
  | {
    id: string
    sessionID: string
    role: "user"
    agent: string
    time: {
      created: number
    }
  }
  | {
    id: string
    sessionID: string
    role: "assistant"
    parentID: string
    agent: string
    finish?: "other" | "length" | "unknown" | "error" | "stop" | "content-filter" | "tool-calls"
    time: {
      created: number
      completed?: number
    }
  }

export type OpenwriteTextPart = {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
  synthetic?: boolean
  kind?: "text" | "tool"
}

export type OpenwriteMessageWithParts = {
  info: OpenwriteMessageInfo
  parts: OpenwriteTextPart[]
}

export type MessageStreamUserAckEvent = {
  type: "user_ack"
  sessionID: string
  userMessageID: string
  createdAt: number
}

export type MessageStreamAssistantStartEvent = {
  type: "assistant_start"
  sessionID: string
  assistantMessageID: string
  parentUserMessageID: string
  createdAt: number
}

export type MessageStreamTextDeltaEvent = {
  type: "text_delta"
  sessionID: string
  assistantMessageID: string
  delta: string
}

export type MessageStreamAssistantFinishEvent = {
  type: "assistant_finish"
  sessionID: string
  assistantMessageID: string
  completedAt: number
  finishReason: string
}

export type MessageStreamDoneEvent = {
  type: "done"
  sessionID: string
  assistantMessageID: string
  completedAt: number
  finishReason: string
}

export type MessageStreamErrorEvent = {
  type: "error"
  code: string
  message: string
  assistantMessageID?: string
  retriable: boolean
}

export type MessageStreamEvent =
  | MessageStreamUserAckEvent
  | MessageStreamAssistantStartEvent
  | MessageStreamTextDeltaEvent
  | MessageStreamAssistantFinishEvent
  | MessageStreamDoneEvent
  | MessageStreamErrorEvent

type RequestJSONError = {
  error?: string
}

function toSSERecord(payload: unknown, eventName: string) {
  if (!payload || typeof payload !== "object") {
    throw new Error(`Invalid payload for SSE event "${eventName}"`)
  }
  return payload as Record<string, unknown>
}

function readString(payload: Record<string, unknown>, key: string, eventName: string) {
  const value = payload[key]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid "${key}" in SSE event "${eventName}"`)
  }
  return value
}

function readNumber(payload: Record<string, unknown>, key: string, eventName: string) {
  const value = payload[key]
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid "${key}" in SSE event "${eventName}"`)
  }
  return value
}

function parseSSEEvent(input: string) {
  let eventName = "message"
  const dataLines: string[] = []
  for (const line of input.split(/\r?\n/)) {
    if (line.startsWith(":")) continue
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim() || "message"
      continue
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart())
    }
  }
  return {
    eventName,
    data: dataLines.join("\n"),
  }
}

async function requestJSON<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as (RequestJSONError & T) | null
  if (!response.ok) {
    const message = payload?.error?.trim() || `HTTP ${response.status}`
    throw new Error(message)
  }
  if (!payload) {
    throw new Error("Empty response payload")
  }
  return payload
}

export async function createProject(title?: string) {
  const payload = await requestJSON<{ project: OpenwriteProject }>("/api/openwrite/project", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(title ? { title } : {}),
  })
  return payload.project
}

export async function listProjects() {
  const payload = await requestJSON<{ projects: OpenwriteProject[] }>("/api/openwrite/projects", {
    method: "GET",
  })
  return payload.projects
}

export async function fetchFileTree(input: {
  projectID: string
  path?: string
  depth?: number
}) {
  const params = new URLSearchParams()
  if (input.path) params.set("path", input.path)
  if (typeof input.depth === "number") params.set("depth", String(input.depth))
  const query = params.toString()
  const path = query ? `/api/openwrite/fs/tree?${query}` : "/api/openwrite/fs/tree"

  const payload = await requestJSON<{ root: OpenwriteFsNode }>(path, {
    method: "GET",
    headers: {
      "x-project-id": input.projectID,
    },
  })
  return payload.root
}

export async function fetchFileContent(input: {
  projectID: string
  path: string
  offset?: number
  limit?: number
}) {
  const params = new URLSearchParams({ path: input.path })
  if (typeof input.offset === "number") params.set("offset", String(input.offset))
  if (typeof input.limit === "number") params.set("limit", String(input.limit))
  const payload = await requestJSON<OpenwriteFsReadResult>(`/api/openwrite/fs/read?${params.toString()}`, {
    method: "GET",
    headers: {
      "x-project-id": input.projectID,
    },
  })
  return payload
}

export async function sendMessage(input: {
  projectID: string
  text: string
  agent?: string
}) {
  await requestJSON<{ message: OpenwriteMessageWithParts }>("/api/openwrite/message", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-project-id": input.projectID,
    },
    body: JSON.stringify({
      text: input.text,
      ...(input.agent ? { agent: input.agent } : {}),
    }),
  })
}

export async function sendMessageStream(input: {
  projectID: string
  text: string
  agent?: string
  signal?: AbortSignal
  onEvent?: (event: MessageStreamEvent) => void
}) {
  const response = await fetch("/api/openwrite/message/stream", {
    method: "POST",
    cache: "no-store",
    signal: input.signal,
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      "x-project-id": input.projectID,
    },
    body: JSON.stringify({
      text: input.text,
      ...(input.agent ? { agent: input.agent } : {}),
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as RequestJSONError | null
    const message = payload?.error?.trim() || `HTTP ${response.status}`
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error("Missing stream response body")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let doneEventSeen = false
  let doneAssistantMessageID = ""

  const emitEvent = (event: MessageStreamEvent) => {
    input.onEvent?.(event)
  }

  const consumePacket = (packet: string) => {
    const { eventName, data } = parseSSEEvent(packet)
    if (eventName === "ping" || data.length === 0) {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(data) as unknown
    } catch {
      throw new Error(`Invalid JSON data in SSE event "${eventName}"`)
    }

    if (eventName === "user_ack") {
      const payload = toSSERecord(parsed, eventName)
      emitEvent({
        type: "user_ack",
        sessionID: readString(payload, "sessionID", eventName),
        userMessageID: readString(payload, "userMessageID", eventName),
        createdAt: readNumber(payload, "createdAt", eventName),
      })
      return
    }

    if (eventName === "assistant_start") {
      const payload = toSSERecord(parsed, eventName)
      emitEvent({
        type: "assistant_start",
        sessionID: readString(payload, "sessionID", eventName),
        assistantMessageID: readString(payload, "assistantMessageID", eventName),
        parentUserMessageID: readString(payload, "parentUserMessageID", eventName),
        createdAt: readNumber(payload, "createdAt", eventName),
      })
      return
    }

    if (eventName === "text_delta") {
      const payload = toSSERecord(parsed, eventName)
      emitEvent({
        type: "text_delta",
        sessionID: readString(payload, "sessionID", eventName),
        assistantMessageID: readString(payload, "assistantMessageID", eventName),
        delta: readString(payload, "delta", eventName),
      })
      return
    }

    if (eventName === "assistant_finish") {
      const payload = toSSERecord(parsed, eventName)
      emitEvent({
        type: "assistant_finish",
        sessionID: readString(payload, "sessionID", eventName),
        assistantMessageID: readString(payload, "assistantMessageID", eventName),
        completedAt: readNumber(payload, "completedAt", eventName),
        finishReason: readString(payload, "finishReason", eventName),
      })
      return
    }

    if (eventName === "done") {
      const payload = toSSERecord(parsed, eventName)
      doneEventSeen = true
      doneAssistantMessageID = readString(payload, "assistantMessageID", eventName)
      emitEvent({
        type: "done",
        sessionID: readString(payload, "sessionID", eventName),
        assistantMessageID: doneAssistantMessageID,
        completedAt: readNumber(payload, "completedAt", eventName),
        finishReason: readString(payload, "finishReason", eventName),
      })
      return
    }

    if (eventName === "error") {
      const payload = toSSERecord(parsed, eventName)
      const event: MessageStreamErrorEvent = {
        type: "error",
        code: readString(payload, "code", eventName),
        message: readString(payload, "message", eventName),
        retriable: payload.retriable === true,
      }
      if (typeof payload.assistantMessageID === "string" && payload.assistantMessageID.length > 0) {
        event.assistantMessageID = payload.assistantMessageID
      }
      emitEvent(event)
      throw new Error(event.message)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const packets = buffer.split(/\r?\n\r?\n/)
    buffer = packets.pop() ?? ""
    for (const packet of packets) {
      if (packet.trim().length === 0) continue
      consumePacket(packet)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim().length > 0) {
    consumePacket(buffer)
  }

  if (!doneEventSeen) {
    throw new Error("Message stream ended before done event")
  }

  return {
    done: true as const,
    assistantMessageID: doneAssistantMessageID,
  }
}

export async function listMessages(input: {
  projectID: string
  limit?: number
  lastMessageID?: string
}) {
  const params = new URLSearchParams()
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit))
  }
  if (input.lastMessageID) {
    params.set("last_message_id", input.lastMessageID)
  }
  const query = params.toString()
  const path = query ? `/api/openwrite/messages?${query}` : "/api/openwrite/messages"
  return requestJSON<{ sessionID: string; messages: OpenwriteMessageWithParts[] }>(path, {
    method: "GET",
    headers: {
      "x-project-id": input.projectID,
    },
  })
}
