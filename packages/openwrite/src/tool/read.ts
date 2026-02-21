import z from "zod"
import { promises as fs } from "node:fs"
import path from "node:path"
import { Tool, type ToolContext } from "./tool"
import DESCRIPTION from "./read.txt"
import { resolveWorkspacePath } from "@/util/workspace-path"

const MAX_LINES = 2000
const MAX_BYTES = 50 * 1024

const formatLines = (lines: string[], offset: number) =>
  lines
    .map((line, index) => `${String(offset + index + 1).padStart(5, "0")}|${line}`)
    .join("\n")

const truncateByBytes = (input: string, maxBytes: number) => {
  const buffer = Buffer.from(input, "utf8")
  if (buffer.byteLength <= maxBytes) {
    return { output: input, truncated: false }
  }
  const sliced = buffer.subarray(0, maxBytes).toString("utf8")
  return { output: sliced, truncated: true }
}

export const ReadTool = Tool.define("read", async () => ({
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z
      .string()
      .min(1)
      .describe("The path to the file to read"),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("The line number to start reading from (0-based)"),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("The number of lines to read (defaults to 2000)"),
  }),
  async execute(params, ctx: ToolContext) {
    const { resolvedPath, logicalNamespacePath } = resolveWorkspacePath(params.filePath, ctx.projectID)
    await ctx.ask({
      permission: "read",
      patterns: [resolvedPath],
      always: ["*"],
      metadata: {
        inputPath: params.filePath,
        filePath: resolvedPath,
        logicalPath: logicalNamespacePath,
      },
    })

    const stat = await fs.stat(resolvedPath)
    if (!stat.isFile()) {
      throw new Error(`Path is not a file: ${resolvedPath}`)
    }

    const raw = await fs.readFile(resolvedPath, "utf8")
    const allLines = raw.split(/\r?\n/)
    const offset = params.offset ?? 0
    const limit = params.limit ?? MAX_LINES
    const end = Math.min(allLines.length, offset + limit)
    const sliced = allLines.slice(offset, end)
    const formatted = formatLines(sliced, offset)
    const truncatedByLines = end < allLines.length
    const truncatedByBytes = truncateByBytes(formatted, MAX_BYTES)
    const truncated = truncatedByLines || truncatedByBytes.truncated

    const footer = truncated
      ? `\n\n[truncated] showing lines ${offset + 1}-${end} of ${allLines.length}`
      : ""

    return {
      title: `Read ${path.basename(resolvedPath)}`,
      metadata: {
        filePath: resolvedPath,
        offset,
        limit,
        totalLines: allLines.length,
        truncated,
      },
      output: truncatedByBytes.output + footer,
    }
  },
}))
