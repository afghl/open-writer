import { z } from "zod"
import { promises as fs } from "node:fs"
import { rootHolder } from "@/global"
import { Identifier } from "@/id/id"
import { Storage } from "@/storage/storage"
import { resolveWorkspacePath } from "@/path/workspace"

const PROJECT_INIT_DIRS = [
  "inputs/library/docs",
  "inputs/library/summary/docs",
  "inputs/insights",
  "spec",
  "article/chapters",
  "article/versions",
]

async function initializeProjectWorkspace(projectID: string) {
  for (const dir of PROJECT_INIT_DIRS) {
    const logicalPath = `${rootHolder}/${dir}`
    const { resolvedPath } = resolveWorkspacePath(logicalPath, projectID)
    await fs.mkdir(resolvedPath, { recursive: true })
  }
}

export namespace Project {
  export const Phase = z.enum(["planning", "writing"])
  export type Phase = z.infer<typeof Phase>

  export const Info = z.object({
    id: Identifier.schema("project"),
    project_slug: z.string(),
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

  function ensureProjectSlug(info: Info): Info {
    if (info.project_slug?.trim()) return info
    return {
      ...info,
      project_slug: info.id,
    }
  }

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
    const id = Identifier.ascending("project")
    const info: Info = {
      id,
      project_slug: id,
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
    await initializeProjectWorkspace(info.id)
    return info
  }

  export async function get(projectID: string) {
    const info = await Storage.read<Info>(["project", projectID])
    return ensureProjectSlug(info)
  }

  export async function list() {
    const ids = await Storage.list(["project"])
    const all = await Promise.all(
      ids.map(async (segments) => ensureProjectSlug(await Storage.read<Info>(segments))),
    )
    all.sort((a, b) => b.time.updated - a.time.updated)
    return all
  }

  export async function update(projectID: string, editor: (draft: Info) => void) {
    return Storage.update<Info>(["project", projectID], (draft) => {
      if (!draft.project_slug?.trim()) {
        draft.project_slug = draft.id
      }
      editor(draft)
      draft.time.updated = Date.now()
    })
  }
}
