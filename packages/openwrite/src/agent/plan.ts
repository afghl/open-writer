import { BaseAgent, type PermissionRuleset } from "./types"
import SYSTEM_PROMPT from "./plan.txt"
import { rootHolder } from "@/global"

const defaultPermission: PermissionRuleset = {}

export class PlanAgent extends BaseAgent {
  constructor() {
    const systemPrompt = SYSTEM_PROMPT.replaceAll("{{WORKSPACE_ROOT}}", rootHolder)
    super({
      id: "plan",
      name: "plan",
      description: "a writing plan agent",
      prompt: systemPrompt,
      mode: "primary",
      native: true,
      permission: defaultPermission,
      options: {},
    })
  }
}
