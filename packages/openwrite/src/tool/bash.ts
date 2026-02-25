import z from "zod"
import { Tool, type ToolContext } from "./tool"
import DESCRIPTION from "./bash.txt"
import { rootHolder } from "@/global"
import { resolveWorkspaceDir, rewriteCommandWorkspacePaths } from "@/util/workspace-path"
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
    command: z.string().min(1).describe("要执行的命令"),
    timeout: z.number().describe("可选超时时间（毫秒）").optional(),
    workdir: z
      .string()
      .describe(
        `运行命令时使用的工作目录。默认值为 ${rootHolder}。请用该参数替代 'cd' 命令。`,
      )
      .optional(),
    description: z
      .string()
      .describe(
        "用 5-10 个词清晰简洁地描述该命令的作用。示例：\n输入：ls\n输出：列出当前目录中的文件\n\n输入：git status\n输出：显示工作区状态\n\n输入：npm install\n输出：安装包依赖\n\n输入：mkdir foo\n输出：创建目录 'foo'",
      ),
  }),
  async execute(params, ctx: ToolContext) {
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
