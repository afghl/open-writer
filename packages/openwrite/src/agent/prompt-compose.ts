import { rootHolder } from "@/global"
import WORKSPACE_CONTRACT_COMMON from "./workspace-contract.txt"

export function composeAgentPrompt(template: string) {
  return template
    .replaceAll("{{WORKSPACE_CONTRACT_COMMON}}", WORKSPACE_CONTRACT_COMMON.trim())
    .replaceAll("{{WORKSPACE_ROOT}}", rootHolder)
}
