import { BaseAgent, type PermissionRuleset } from "./types"
import SYSTEM_PROMPT from "./plan.txt"
import path from "path"

const defaultPermission: PermissionRuleset = {}

export class PlanAgent extends BaseAgent {
  constructor() {
    const systemPrompt = SYSTEM_PROMPT.replace("{{WORKSPACE_ROOT}}", path.join(process.cwd(), "workspace"))
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
