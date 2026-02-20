import { BaseAgent, type PermissionRuleset } from "./types"
import SYSTEM_PROMPT from "./plan.txt"
import { rootHolder } from "@/global"
import { SEARCH_TOOL_IDS } from "@/tool/search-shared"

const defaultPermission: PermissionRuleset = {
  denyTools: Array.from(SEARCH_TOOL_IDS),
}

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
