import { BaseAgent, type PermissionRuleset } from "./types"
import SYSTEM_PROMPT from "./general.txt"
import { SEARCH_TOOL_IDS } from "../tool/search-shared"

const defaultPermission: PermissionRuleset = {
  denyTools: [
    ...Array.from(SEARCH_TOOL_IDS),
    "agentic_search",
  ],
}

export class GeneralAgent extends BaseAgent {
  constructor() {
    super({
      id: "general",
      name: "general",
      description: "a general purpose agent",
      prompt: SYSTEM_PROMPT,
      mode: "primary",
      native: true,
      permission: defaultPermission,
      options: {},
    })
  }
}
