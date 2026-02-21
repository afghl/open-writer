import { BaseAgent } from "./types"
import SYSTEM_PROMPT from "./search.txt"
import { rootHolder } from "@/global"
import { SEARCH_TOOL_IDS } from "@/tool"

const SEARCH_AGENT_TOOL_IDS = [
  ...Array.from(SEARCH_TOOL_IDS),
  "read",
  "edit",
  "bash",
] as const

export class SearchAgent extends BaseAgent {
  constructor() {
    const systemPrompt = SYSTEM_PROMPT.replaceAll("{{WORKSPACE_ROOT}}", rootHolder)
    super({
      id: "search",
      name: "search",
      description: "a retrieval-focused search agent",
      prompt: systemPrompt,
      mode: "subagent",
      hidden: true,
      native: true,
      model: {
        providerID: "openai",
        modelID: "gpt-4o-mini",
      },
      steps: 8,
      permission: {
        allowTools: Array.from(SEARCH_AGENT_TOOL_IDS),
      },
      options: {},
    })
  }
}
