import { z } from "zod"
import { Identifier } from "@/id/id"
import { Storage } from "@/storage/storage"

export namespace Project {
  export const Phase = z.enum(["planning", "writing"])
  export type Phase = z.infer<typeof Phase>

  export const Info = z.object({
    id: Identifier.schema("project"),
    title: z.string(),
    curr_session_id: z.string(),
    curr_agent_name: z.string(),
    phase: Phase,
    time: z.object({
      created: z.number(),
      updated: z.number(),
    }),
  })
  export type Info = z.infer<typeof Info>

  export function defaultTitle() {
    return `New project - ${new Date().toISOString()}`
  }

  export function isDefaultTitle(title: string) {
    return title.startsWith("New project - ")
  }

  export function defaultAgentName() {
    return "plan"
  }

  export async function create(input: {
    title?: string
    curr_session_id?: string
    curr_agent_name: string
    phase?: Phase
  }) {
    const info: Info = {
      id: Identifier.ascending("project"),
      title: input.title ?? defaultTitle(),
      curr_session_id: input.curr_session_id ?? "",
      curr_agent_name: input.curr_agent_name,
      phase: input.phase ?? "planning",
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }
    await Storage.write(["project", info.id], info)
    return info
  }

  export async function get(projectID: string) {
    return Storage.read<Info>(["project", projectID])
  }

  export async function update(projectID: string, editor: (draft: Info) => void) {
    return Storage.update<Info>(["project", projectID], (draft) => {
      editor(draft)
      draft.time.updated = Date.now()
    })
  }
}
