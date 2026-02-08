export type AgentMode = "primary" | "subagent" | "all"

export type PermissionRuleset = {
  allowTools?: string[]
  denyTools?: string[]
}

export type AgentInfo = {
  id: string
  name: string
  description?: string
  mode: AgentMode
  hidden?: boolean
  native?: boolean
  model?: {
    providerID: string
    modelID: string
  }
  prompt?: string
  temperature?: number
  topP?: number
  steps?: number
  options: Record<string, unknown>
  permission: PermissionRuleset
}

export interface Agent {
  Info(): AgentInfo
}

export class BaseAgent implements Agent {
  constructor(private readonly meta: AgentInfo) { }

  Info() {
    return this.meta
  }
}