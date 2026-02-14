import { BaseAgent } from "./types"
import SYSTEM_PROMPT from "./search.txt"
import { SEARCH_TOOL_IDS } from "@/tool"

export class SearchAgent extends BaseAgent {
  constructor() {
    super({
      id: "search",
      name: "search",
      description: "a retrieval-focused search agent",
      prompt: SYSTEM_PROMPT,
      mode: "subagent",
      hidden: true,
      native: true,
      model: {
        providerID: "openai",
        modelID: "gpt-4o-mini",
      },
      steps: 8,
      permission: {
        allowTools: Array.from(SEARCH_TOOL_IDS),
      },
      options: {},
    })
  }
}
