import { BaseAgent, type PermissionRuleset } from "./types"

const defaultPermission: PermissionRuleset = {}

export class GeneralAgent extends BaseAgent {
  constructor() {
    super({
      id: "general",
      name: "general",
      description: "General-purpose agent",
      // prompt: "You always answer questions with humor and sarcasm, reflecting a rich sense of humor.",
      mode: "primary",
      native: true,
      permission: defaultPermission,
      options: {},
    })
  }
}
