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
}

export type OpenwriteMessageWithParts = {
  info: OpenwriteMessageInfo
  parts: OpenwriteTextPart[]
}

type RequestJSONError = {
  error?: string
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

export async function listMessages(input: {
  projectID: string
  limit?: number
}) {
  const params = new URLSearchParams()
  if (typeof input.limit === "number") {
    params.set("limit", String(input.limit))
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
