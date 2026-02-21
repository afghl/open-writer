import { z } from "zod"
import { promises as fs } from "node:fs"
import { Identifier } from "@/id"
import { Storage } from "@/storage"
import { logicalWorkspacePath, resolveWorkspacePath } from "@/util/workspace-path"

const PROJECT_INIT_DIRS = [
  "inputs/library/docs",
  "inputs/library/docs/summary",
  "inputs/insights",
  "spec",
  "article/chapters",
  "article/versions",
]

async function initializeProjectWorkspace(projectID: string) {
  for (const dir of PROJECT_INIT_DIRS) {
    const logicalPath = logicalWorkspacePath(projectID, dir)
    const { resolvedPath } = resolveWorkspacePath(logicalPath, projectID)
    await fs.mkdir(resolvedPath, { recursive: true })
  }
}

export const ProjectPhase = z.enum(["planning", "writing"])
export type ProjectPhase = z.infer<typeof ProjectPhase>

export const ProjectInfoSchema = z.object({
  id: Identifier.schema("project"),
  project_slug: z.string(),
  title: z.string(),
  curr_session_id: z.string(),
  curr_agent_name: z.string(),
  root_thread_id: z.string(),
  curr_thread_id: z.string(),
  phase: ProjectPhase,
  time: z.object({
    created: z.number(),
    updated: z.number(),
  }),
})
export type ProjectInfo = z.infer<typeof ProjectInfoSchema>

function ensureProjectSlug(info: ProjectInfo): ProjectInfo {
  if (info.project_slug?.trim()) return info
  return {
    ...info,
    project_slug: info.id,
  }
}

function fallbackRootThreadID(projectID: string) {
  return `thread_${projectID}`
}

function ensureThreadIDs(info: ProjectInfo): ProjectInfo {
  const root = info.root_thread_id?.trim() ? info.root_thread_id : fallbackRootThreadID(info.id)
  const curr = info.curr_thread_id?.trim() ? info.curr_thread_id : root
  if (root === info.root_thread_id && curr === info.curr_thread_id) {
    return info
  }
  return {
    ...info,
    root_thread_id: root,
    curr_thread_id: curr,
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
  curr_thread_id?: string
  root_thread_id?: string
  phase?: ProjectPhase
}) {
  const id = Identifier.ascending("project")
  const rootThreadID = input.root_thread_id?.trim() || Identifier.ascending("thread")
  const currThreadID = input.curr_thread_id?.trim() || rootThreadID
  const info: ProjectInfo = {
    id,
    project_slug: id,
    title: input.title ?? defaultTitle(),
    curr_session_id: input.curr_session_id ?? "",
    curr_agent_name: input.curr_agent_name,
    root_thread_id: rootThreadID,
    curr_thread_id: currThreadID,
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
  const info = await Storage.read<ProjectInfo>(["project", projectID])
  return ensureThreadIDs(ensureProjectSlug(info))
}

export async function list() {
  const ids = await Storage.list(["project"])
  const all = await Promise.all(
    ids.map(async (segments) => ensureThreadIDs(ensureProjectSlug(await Storage.read<ProjectInfo>(segments)))),
  )
  all.sort((a, b) => b.time.updated - a.time.updated)
  return all
}

export async function update(projectID: string, editor: (draft: ProjectInfo) => void) {
  return Storage.update<ProjectInfo>(["project", projectID], (draft) => {
    if (!draft.project_slug?.trim()) {
      draft.project_slug = draft.id
    }
    if (!draft.root_thread_id?.trim()) {
      draft.root_thread_id = fallbackRootThreadID(draft.id)
    }
    if (!draft.curr_thread_id?.trim()) {
      draft.curr_thread_id = draft.root_thread_id
    }
    editor(draft)
    draft.time.updated = Math.max(Date.now(), draft.time.updated) + 1
  })
}

export const Project = {
  Phase: ProjectPhase,
  Info: ProjectInfoSchema,
  defaultTitle,
  isDefaultTitle,
  defaultAgentName,
  create,
  get,
  list,
  update,
}
