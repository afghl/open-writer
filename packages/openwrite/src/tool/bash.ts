import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./bash.txt"
import { rootHolder } from "@/global"
import { resolveWorkspaceDir, rewriteCommandWorkspacePaths } from "@/path/workspace"
import { Log } from "@/util/log"
const DEFAULT_TIMEOUT = 120_000
const MAX_LINES = 2000
const MAX_BYTES = 50 * 1024

const commandPrefix = (command: string) => {
  const trimmed = command.trim()
  if (!trimmed) return command
  return trimmed.split(/\s+/)[0]
}

export const BashTool = Tool.define("bash", async () => ({
  description: DESCRIPTION.replaceAll("${directory}", rootHolder)
    .replaceAll("${maxLines}", String(MAX_LINES))
    .replaceAll("${maxBytes}", String(MAX_BYTES)),
  parameters: z.object({
    command: z.string().min(1).describe("The command to execute"),
    timeout: z.number().describe("Optional timeout in milliseconds").optional(),
    workdir: z
      .string()
      .describe(
        `The working directory to run the command in. Defaults to ${rootHolder}. Use this instead of 'cd' commands.`,
      )
      .optional(),
    description: z
      .string()
      .describe(
        "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
      ),
  }),
  async execute(params, ctx: Tool.Context) {
    const resolvedCommand = rewriteCommandWorkspacePaths(params.command, ctx.projectID)
    const { resolvedPath: workdir, logicalNamespacePath } = resolveWorkspaceDir(params.workdir, ctx.projectID)
    await ctx.ask({
      permission: "bash",
      patterns: [commandPrefix(resolvedCommand)],
      always: ["*"],
      metadata: {
        command: params.command,
        resolvedCommand,
        inputWorkdir: params.workdir ?? rootHolder,
        workdir,
        logicalWorkdir: logicalNamespacePath,
      },
    })

    const cmd = process.platform === "win32"
      ? ["cmd", "/c", resolvedCommand]
      : ["/bin/sh", "-lc", resolvedCommand]
    Log.Default.info("Executing command", { cmd, cwd: workdir })
    const proc = Bun.spawn({
      cmd,
      cwd: workdir,
      stdout: "pipe",
      stderr: "pipe",
    })

    let timedOut = false
    let aborted = false

    const abortHandler = () => {
      aborted = true
      proc.kill()
    }
    ctx.abort.addEventListener("abort", abortHandler)

    const timeoutMs = params.timeout ?? DEFAULT_TIMEOUT
    const timer = setTimeout(() => {
      timedOut = true
      proc.kill()
    }, timeoutMs)

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    clearTimeout(timer)
    ctx.abort.removeEventListener("abort", abortHandler)

    let output = stdout
    if (stderr.trim()) {
      output = output ? `${output}\n${stderr}` : stderr
    }
    if (timedOut) {
      output += "\n\n[bash timeout]"
    } else if (aborted) {
      output += "\n\n[bash aborted]"
    }

    return {
      title: params.description,
      metadata: {
        command: params.command,
        success: exitCode == 0,
        exitCode,
        timedOut,
        aborted,
      },
      output,
    }
  },
}))
