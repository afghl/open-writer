import { BaseAgent, type PermissionRuleset } from "./types"
import SYSTEM_PROMPT from "./writer.txt"
import { SEARCH_TOOL_IDS } from "@/tool/search-shared"
import { composeAgentPrompt } from "./prompt-compose"

const defaultPermission: PermissionRuleset = {
  denyTools: [
    ...Array.from(SEARCH_TOOL_IDS),
    "agentic_search",
  ],
}

export class WriterAgent extends BaseAgent {
  constructor() {
    const systemPrompt = composeAgentPrompt(SYSTEM_PROMPT)
    super({
      id: "writer",
      name: "writer",
      description: "a writing agent",
      prompt: systemPrompt,
      mode: "primary",
      native: true,
      permission: defaultPermission,
      options: {},
    })
  }
}
