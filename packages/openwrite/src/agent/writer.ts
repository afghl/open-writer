import { BaseAgent, type PermissionRuleset } from "./types"
import SYSTEM_PROMPT from "./writer.txt"

const defaultPermission: PermissionRuleset = {}

export class WriterAgent extends BaseAgent {
  constructor() {
    super({
      id: "writer",
      name: "writer",
      description: "a writing agent",
      prompt: SYSTEM_PROMPT,
      mode: "primary",
      native: true,
      permission: defaultPermission,
      options: {},
    })
  }
}

