import { BaseAgent, type PermissionRuleset } from "./types"
import SYSTEM_PROMPT from "./plan.txt"
import { rootHolder } from "@/global"
import { composeAgentPrompt } from "./prompt-compose"
import { SEARCH_TOOL_IDS } from "./search-shared"

const defaultPermission: PermissionRuleset = {
  denyTools: Array.from(SEARCH_TOOL_IDS),
}

export class PlanAgent extends BaseAgent {
  constructor() {
    const systemPrompt = composeAgentPrompt(SYSTEM_PROMPT)
    super({
      id: "plan",
      name: "plan",
      description: "写作规划代理",
      prompt: systemPrompt,
      mode: "primary",
      native: true,
      permission: defaultPermission,
      options: {},
    })
  }
}
