import fs from "fs"
import path from "path"
import { GeneralAgent } from "./general"
import { PlanAgent } from "./plan"
import { SearchAgent } from "./search"
import { WriterAgent } from "./writer"
import type { Agent } from "./types"
import { Log } from "@/util/log"

export class AgentRegistry {
  private agents = new Map<string, Agent>()

  constructor(initial?: Agent[]) {
    if (initial) {
      for (const agent of initial) {
        this.register(agent)
      }
    }
  }

  register(agent: Agent) {
    this.agents.set(agent.Info().id, agent)
  }

  get(id: string) {
    return this.agents.get(id)
  }

  list() {
    return Array.from(this.agents.values())
  }

  default() {
    return "plan"
  }

  resolve(id?: string): Agent {
    Log.Default.info("Resolving agent", { id })
    if (id) {
      const match = this.get(id)
      if (match) return match
    }

    const fallback = this.get(this.default())
    if (!fallback) {
      throw new Error("Default agent not found")
    }
    return fallback
  }

  resolveStrict(id: string): Agent {
    Log.Default.info("Resolving agent strictly", { id })
    const match = this.get(id)
    if (!match) {
      throw new Error(`Agent not found: ${id}`)
    }
    return match
  }
}

const agentRegistry = new AgentRegistry()

agentRegistry.register(new GeneralAgent())
agentRegistry.register(new PlanAgent())
agentRegistry.register(new SearchAgent())
agentRegistry.register(new WriterAgent())

export { agentRegistry }
