import { promises as fs } from "node:fs"
import path from "node:path"
import { agentRegistry } from "@/agent"
import type { ProjectInfo } from "@/project"
import type { TaskInfo } from "@/task"
import { projectWorkspaceRoot } from "@/util/workspace-path"
import { parseHandoffTaskInput, type HandoffTaskInput } from "./types"

export type HandoffValidation = {
  lock: Record<string, unknown>
  handoff: Record<string, unknown>
  input: HandoffTaskInput
}

function isLocked(value: Record<string, unknown>) {
  if (value.locked === true) return true
  if (value.status === "locked") return true
  if (value.state === "locked") return true
  return false
}

async function readJSON(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8")
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`JSON file must contain an object: ${filePath}`)
  }
  return parsed as Record<string, unknown>
}

export async function validate(input: {
  project: ProjectInfo
  task: TaskInfo
}): Promise<HandoffValidation> {
  const handoffInput = parseHandoffTaskInput(input.task)

    if (input.project.phase !== "planning") {
      throw new Error("Project must be in planning phase before handoff.")
    }
    if (input.project.curr_agent_name !== "plan") {
      throw new Error("Handoff can only start from plan agent.")
    }
    if (handoffInput.target_agent_name === input.project.curr_agent_name) {
      throw new Error("Target agent must differ from current agent.")
    }
    const targetAgent = agentRegistry.get(handoffInput.target_agent_name)
    if (!targetAgent) {
      throw new Error(`Target agent not found: ${handoffInput.target_agent_name}`)
    }

    const workspaceRoot = projectWorkspaceRoot(input.project.id)
    const lockPath = path.join(workspaceRoot, "spec", "lock.json")
    const handoffPath = path.join(workspaceRoot, "spec", "handoff.json")

    const lock = await readJSON(lockPath)
    if (!isLocked(lock)) {
      throw new Error("spec/lock.json exists but is not locked.")
    }
    const handoff = await readJSON(handoffPath)

  return {
    lock,
    handoff,
    input: handoffInput,
  }
}

export const HandoffValidator = {
  validate,
}
