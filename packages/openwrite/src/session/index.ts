import { z } from "zod"
import { Identifier } from "@/id/id"
import { Storage } from "@/storage/storage"
import { Message } from "./message"
import { Log } from "@/util/log"

const log = Log.create({ service: "session" })

export namespace Session {
  export const Status = z.enum(["idle", "chatting", "handoff_processing"])
  export type Status = z.infer<typeof Status>

  export const Info = z.object({
    id: Identifier.schema("session"),
    projectID: Identifier.schema("project"),
    title: z.string(),
    status: Status,
    active_task_id: z.string(),
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })
  export type Info = z.infer<typeof Info>

  type LegacyInfo = Omit<Info, "status" | "active_task_id"> & {
    status?: Status
    active_task_id?: string
  }

  function ensureInfoDefaults(info: LegacyInfo): Info {
    return {
      ...info,
      status: info.status ?? "idle",
      active_task_id: info.active_task_id ?? "",
    }
  }

  export async function create(input: { projectID: string; title?: string }) {
    const info: Info = {
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

  export async function update(sessionID: string, editor: (draft: Info) => void) {
    return Storage.update<Info>(["session", sessionID], (draft) => {
      const normalized = ensureInfoDefaults(draft)
      draft.status = normalized.status
      draft.active_task_id = normalized.active_task_id
      editor(draft)
      draft.time.updated = Date.now()
    })
  }

  export async function transitionStatus(input: {
    sessionID: string
    from: Status[]
    to: Status
    activeTaskID?: string
  }) {
    let changed = false
    let nextInfo: Info | undefined
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

  export async function updateMessage(info: Message.Info) {
    await Storage.write(["message", info.sessionID, info.id], info)
    return info
  }

  export async function updatePart(part: Message.Part) {
    await Storage.write(["part", part.messageID, part.id], part)
    return part
  }

  export async function parts(messageID: string) {
    const result: Message.Part[] = []
    for (const item of await Storage.list(["part", messageID])) {
      result.push(await Storage.read<Message.Part>(item))
    }
    result.sort((a, b) => (a.id > b.id ? 1 : -1))
    return result
  }

  function attachRunID(info: Message.Info, defaultRunID = ""): Message.Info {
    const runID = "run_id" in info && typeof info.run_id === "string" && info.run_id.length > 0
      ? info.run_id
      : defaultRunID
    if (info.role === "user") {
      return {
        ...info,
        run_id: runID,
      }
    }
    return {
      ...info,
      run_id: runID,
    }
  }

  export async function messages(input: { sessionID: string; limit?: number; defaultRunID?: string }) {
    const result: Message.WithParts[] = []
    const items = await Storage.list(["message", input.sessionID])
    for (const item of items) {
      if (input.limit && result.length >= input.limit) break
      const raw = await Storage.read<Message.Info>(item)
      const info = attachRunID(raw, input.defaultRunID ?? "")
      const msgParts = await parts(info.id)
      result.push({ info, parts: msgParts })
    }
    result.sort((a, b) => (a.info.id > b.info.id ? 1 : -1))
    return result
  }

  export async function messagesByRun(input: {
    sessionID: string
    runID: string
    limit?: number
    defaultRunID?: string
  }) {
    const all = await messages({
      sessionID: input.sessionID,
      limit: input.limit,
      defaultRunID: input.defaultRunID,
    })
    return all.filter((message) => message.info.run_id === input.runID)
  }
}
