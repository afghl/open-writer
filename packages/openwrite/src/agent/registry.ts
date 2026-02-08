import fs from "fs"
import path from "path"
import { GeneralAgent } from "./general"
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
    Log.Default.info("Registering agent", { agent })
    const info = agent.Info()
    if (!info.prompt) {
      const prompt = this.loadPrompt(info.id)
      Log.Default.info("Loaded prompt for agent", { agentID: info.id, prompt })
      if (prompt) {
        info.prompt = prompt
        Log.Default.info("Set prompt for agent", { agentID: info.id, prompt })
      }
    }
    this.agents.set(info.id, agent)
  }

  get(id: string) {
    return this.agents.get(id)
  }

  list() {
    return Array.from(this.agents.values())
  }

  default() {
    return "general"
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

  private loadPrompt(agentID: string) {
    Log.Default.info("Loading prompt for agent", { agentID })
    const promptPath = path.join(process.cwd(), "prompts", "agents", `${agentID}.txt`)
    Log.Default.info("Prompt path", { promptPath })
    if (!fs.existsSync(promptPath)) return undefined
    const text = fs.readFileSync(promptPath, "utf8").trim()
    Log.Default.info("Loaded prompt for agent", { agentID, promptPath, text })
    return text.length > 0 ? text : undefined
  }
}

const agentRegistry = new AgentRegistry()

agentRegistry.register(new GeneralAgent())

export { agentRegistry }
