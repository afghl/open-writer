import { BaseAgent, type PermissionRuleset } from "./types"
import SYSTEM_PROMPT from "./general.txt"

const defaultPermission: PermissionRuleset = {}

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
