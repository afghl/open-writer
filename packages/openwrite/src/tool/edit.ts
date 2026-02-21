import z from "zod"
import { promises as fs } from "node:fs"
import path from "node:path"
import { createTwoFilesPatch, diffLines } from "diff"
import { Tool, type ToolContext } from "./tool"
import DESCRIPTION from "./edit.txt"
import { resolveWorkspacePath } from "@/util/workspace-path"
import { publish } from "@/bus"
import { fsUpdated } from "@/bus"

const diffStats = (before: string, after: string) => {
  let additions = 0
  let deletions = 0
  for (const part of diffLines(before, after)) {
    if (part.added) additions += part.count ?? 0
    if (part.removed) deletions += part.count ?? 0
  }
  return { additions, deletions }
}

export const EditTool = Tool.define("edit", async () => ({
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().min(1).describe("The absolute path to the file to modify"),
    oldString: z.string().describe("The text to replace"),
    newString: z.string().describe("The text to replace it with (must be different from oldString)"),
    replaceAll: z.boolean().optional().describe("Replace all occurrences of oldString (default false)"),
  }),
  async execute(params, ctx: ToolContext) {
    const { resolvedPath, logicalNamespacePath } = resolveWorkspacePath(params.filePath, ctx.projectID)
    await ctx.ask({
      permission: "edit",
      patterns: [resolvedPath],
      always: ["*"],
      metadata: {
        inputPath: params.filePath,
        filePath: resolvedPath,
        logicalPath: logicalNamespacePath,
      },
    })

    let before = ""
    try {
      const stat = await fs.stat(resolvedPath)
      if (!stat.isFile()) {
        throw new Error(`Path is not a file: ${resolvedPath}`)
      }
      before = await fs.readFile(resolvedPath, "utf8")
    } catch (error) {
      if (params.oldString !== "") {
        throw error
      }
    }

    let after = before
    if (params.oldString === "") {
      after = params.newString
    } else {
      if (!before.includes(params.oldString)) {
        throw new Error("Old string not found in file.")
      }
      after = params.replaceAll
        ? before.split(params.oldString).join(params.newString)
        : before.replace(params.oldString, params.newString)
    }

    await fs.writeFile(resolvedPath, after, "utf8")
    await publish(fsUpdated, {
      projectID: ctx.projectID,
      path: logicalNamespacePath,
      kind: "file",
      source: "agent_tool",
      time: Date.now(),
    })

    const diff = createTwoFilesPatch(
      resolvedPath,
      resolvedPath,
      before,
      after,
      "before",
      "after",
      { context: 3 },
    )
    const stats = diffStats(before, after)

    return {
      title: `Edit ${path.basename(resolvedPath)}`,
      metadata: {
        filePath: resolvedPath,
        diff,
        additions: stats.additions,
        deletions: stats.deletions,
      },
      output: "Edit applied successfully.",
    }
  },
}))
