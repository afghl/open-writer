import { BaseAgent } from "./types"
import SYSTEM_PROMPT from "./search.txt"
import { rootHolder } from "@/global"
import { composeAgentPrompt } from "./prompt-compose"
import { SEARCH_TOOL_IDS } from "./search-shared"

const SEARCH_AGENT_TOOL_IDS = [
  ...Array.from(SEARCH_TOOL_IDS),
  "read",
  "edit",
  "bash",
] as const

export class SearchAgent extends BaseAgent {
  constructor() {
    const systemPrompt = composeAgentPrompt(SYSTEM_PROMPT)
    super({
      id: "search",
      name: "search",
      description: "检索优先的搜索代理",
      prompt: systemPrompt,
      mode: "subagent",
      hidden: true,
      native: true,
      model: {
        providerID: "openai",
        modelID: "gpt-4o-mini",
      },
      steps: 12,
      permission: {
        allowTools: Array.from(SEARCH_AGENT_TOOL_IDS),
      },
      options: {},
    })
  }
}
