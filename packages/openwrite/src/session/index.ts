import { z } from "zod"
import { Identifier } from "@/id/id"
import { Storage } from "@/storage/storage"
import { Message } from "./message"
import { Log } from "@/util/log"

const log = Log.create({ service: "session" })

export namespace Session {
  export const Info = z.object({
    id: Identifier.schema("session"),
    projectID: Identifier.schema("project"),
    title: z.string(),
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })
  export type Info = z.infer<typeof Info>

  export async function create(input: { projectID: string; title?: string }) {
    const info: Info = {
      id: Identifier.ascending("session"),
      projectID: input.projectID,
      title: input?.title ?? `New session - ${new Date().toISOString()}`,
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }
    await Storage.write(["session", info.id], info)
    return info
  }

  export async function get(sessionID: string) {
    return Storage.read<Info>(["session", sessionID])
  }

  export async function update(sessionID: string, editor: (draft: Info) => void) {
    return Storage.update<Info>(["session", sessionID], (draft) => {
      editor(draft)
      draft.time.updated = Date.now()
    })
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

  export async function messages(input: { sessionID: string; limit?: number }) {
    const result: Message.WithParts[] = []
    const items = await Storage.list(["message", input.sessionID])
    for (const item of items) {
      if (input.limit && result.length >= input.limit) break
      const info = await Storage.read<Message.Info>(item)
      const msgParts = await parts(info.id)
      result.push({ info, parts: msgParts })
    }
    result.sort((a, b) => (a.info.id > b.info.id ? 1 : -1))
    return result
  }
}
