import { z } from "zod"
import { Identifier } from "@/id"
import { Storage } from "@/storage"
import type { MessageInfo, MessagePart, MessageWithParts } from "./message"

export const SessionStatus = z.enum(["idle", "chatting", "handoff_processing"])
export type SessionStatus = z.infer<typeof SessionStatus>

export const SessionInfoSchema = z.object({
  id: Identifier.schema("session"),
  projectID: Identifier.schema("project"),
  title: z.string(),
  status: SessionStatus,
  active_task_id: z.string(),
  time: z.object({
    created: z.number(),
    updated: z.number(),
  }),
})
export type SessionInfo = z.infer<typeof SessionInfoSchema>

type LegacyInfo = Omit<SessionInfo, "status" | "active_task_id"> & {
  status?: SessionStatus
  active_task_id?: string
}

function ensureInfoDefaults(info: LegacyInfo): SessionInfo {
  return {
    ...info,
    status: info.status ?? "idle",
    active_task_id: info.active_task_id ?? "",
  }
}

export async function create(input: { projectID: string; title?: string }) {
  const info: SessionInfo = {
    id: Identifier.ascending("session"),
    projectID: input.projectID,
    title: input?.title ?? `New session - ${new Date().toISOString()}`,
    status: "idle",
    active_task_id: "",
    time: {
      created: Date.now(),
      updated: Date.now(),
    },
  }
  await Storage.write(["session", info.id], info)
  return info
}

export async function get(sessionID: string) {
  const info = await Storage.read<LegacyInfo>(["session", sessionID])
  return ensureInfoDefaults(info)
}

export async function update(sessionID: string, editor: (draft: SessionInfo) => void) {
  return Storage.update<SessionInfo>(["session", sessionID], (draft) => {
    const normalized = ensureInfoDefaults(draft)
    draft.status = normalized.status
    draft.active_task_id = normalized.active_task_id
    editor(draft)
    draft.time.updated = Date.now()
  })
}

export async function transitionStatus(input: {
  sessionID: string
  from: SessionStatus[]
  to: SessionStatus
  activeTaskID?: string
}) {
  let changed = false
  let nextInfo: SessionInfo | undefined
  await update(input.sessionID, (draft) => {
    if (!input.from.includes(draft.status)) {
      return
    }
    draft.status = input.to
    draft.active_task_id = input.activeTaskID ?? ""
    changed = true
    nextInfo = {
      ...draft,
    }
  })
  return {
    changed,
    info: nextInfo,
  }
}

export async function releaseTaskStatus(sessionID: string, taskID: string) {
  let changed = false
  await update(sessionID, (draft) => {
    if (draft.active_task_id !== taskID) {
      return
    }
    draft.status = "idle"
    draft.active_task_id = ""
    changed = true
  })
  return changed
}

export async function updateMessage(info: MessageInfo) {
  await Storage.write(["message", info.sessionID, info.id], info)
  return info
}

export async function updatePart(part: MessagePart) {
  await Storage.write(["part", part.messageID, part.id], part)
  return part
}

export async function parts(messageID: string) {
  const result: MessagePart[] = []
  for (const item of await Storage.list(["part", messageID])) {
    result.push(await Storage.read<MessagePart>(item))
  }
  result.sort((a, b) => (a.id > b.id ? 1 : -1))
  return result
}

function attachThreadID(info: MessageInfo, defaultThreadID = ""): MessageInfo {
  const threadID = "thread_id" in info && typeof info.thread_id === "string" && info.thread_id.length > 0
    ? info.thread_id
    : defaultThreadID
  if (info.role === "user") {
    return {
      ...info,
      thread_id: threadID,
    }
  }
  return {
    ...info,
    thread_id: threadID,
  }
}

export async function messages(input: { sessionID: string; limit?: number; defaultThreadID?: string }) {
  const result: MessageWithParts[] = []
  const items = await Storage.list(["message", input.sessionID])
  for (const item of items) {
    if (input.limit && result.length >= input.limit) break
    const raw = await Storage.read<MessageInfo>(item)
    const info = attachThreadID(raw, input.defaultThreadID ?? "")
    const msgParts = await parts(info.id)
    result.push({ info, parts: msgParts })
  }
  result.sort((a, b) => (a.info.id > b.info.id ? 1 : -1))
  return result
}

export async function messagesByThread(input: {
  sessionID: string
  threadID: string
  limit?: number
  defaultThreadID?: string
}) {
  const all = await messages({
    sessionID: input.sessionID,
    limit: input.limit,
    defaultThreadID: input.defaultThreadID,
  })
  return all.filter((message) => message.info.thread_id === input.threadID)
}

export const Session = {
  Status: SessionStatus,
  Info: SessionInfoSchema,
  create,
  get,
  update,
  transitionStatus,
  releaseTaskStatus,
  updateMessage,
  updatePart,
  parts,
  messages,
  messagesByThread,
}
