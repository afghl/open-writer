import z from "zod"
import { spawn } from "child_process"
import path from "path"
import { Tool } from "./tool"

const DEFAULT_TIMEOUT = 2 * 60 * 1000
const MAX_OUTPUT_BYTES = 100_000

function resolveCwd(inputPath?: string) {
  if (!inputPath) return process.cwd()
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath)
}

export const BashTool = Tool.define("bash", {
  description: "Execute a shell command with an optional working directory.",
  parameters: z.object({
    command: z.string().min(1).describe("The command to execute"),
    timeout: z.number().int().min(1).optional().describe("Optional timeout in milliseconds"),
    workdir: z.string().optional().describe("Working directory to run the command in"),
    description: z
      .string()
      .min(1)
      .describe("Clear, concise description of what this command does in 5-10 words"),
  }),
  async execute(params, ctx) {
    const cwd = resolveCwd(params.workdir)
    const timeout = params.timeout ?? DEFAULT_TIMEOUT

    await ctx.ask({
      permission: "bash",
      patterns: [params.command],
      always: ["*"],
      metadata: { cwd },
    })

    const output = await new Promise<string>((resolve, reject) => {
      const proc = spawn(params.command, {
        cwd,
        shell: true,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      })

      let result = ""
      let killed = false

      const append = (chunk: Buffer) => {
        if (result.length >= MAX_OUTPUT_BYTES) return
        result += chunk.toString()
        if (result.length > MAX_OUTPUT_BYTES) {
          result = result.slice(0, MAX_OUTPUT_BYTES) + "\n... (truncated)"
        }
      }

      proc.stdout?.on("data", append)
      proc.stderr?.on("data", append)
      proc.on("error", reject)

      const timer = setTimeout(() => {
        killed = true
        proc.kill("SIGTERM")
      }, timeout)

      proc.on("close", (code, signal) => {
        clearTimeout(timer)
        if (killed) {
          return reject(new Error(`Command timed out after ${timeout}ms`))
        }
        if (signal) {
          return reject(new Error(`Command terminated by signal: ${signal}`))
        }
        if (code && code !== 0) {
          return reject(new Error(`Command failed with exit code ${code}\n\n${result}`))
        }
        resolve(result)
      })
    })

    return {
      title: params.description,
      metadata: { cwd },
      output: output || "(command produced no output)",
    }
  },
})
