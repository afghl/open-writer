import z from "zod"
import path from "path"
import fs from "fs/promises"
import { Tool } from "./tool"

const DEFAULT_READ_LIMIT = 2000

function resolvePath(inputPath: string) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath)
}

function isBinaryBuffer(buffer: Buffer) {
  return buffer.includes(0)
}

export const ReadTool = Tool.define("read", {
  description: "Read a file from disk with optional offset and limit.",
  parameters: z.object({
    filePath: z.string().describe("The path to the file to read"),
    offset: z.coerce.number().int().min(0).optional().describe("The line number to start reading from (0-based)"),
    limit: z.coerce.number().int().min(1).optional().describe("The number of lines to read (default 2000)"),
  }),
  async execute(params, ctx) {
    const filePath = resolvePath(params.filePath)
    const title = path.relative(process.cwd(), filePath)

    await ctx.ask({
      permission: "read",
      patterns: [filePath],
      always: ["*"],
      metadata: {},
    })

    let stat
    try {
      stat = await fs.stat(filePath)
    } catch {
      throw new Error(`File not found: ${filePath}`)
    }
    if (stat.isDirectory()) {
      throw new Error(`Path is a directory, not a file: ${filePath}`)
    }

    const buffer = await fs.readFile(filePath)
    if (isBinaryBuffer(buffer)) {
      throw new Error(`Cannot read binary file: ${filePath}`)
    }

    const text = buffer.toString("utf8")
    const lines = text.split("\n")
    const offset = params.offset ?? 0
    const limit = params.limit ?? DEFAULT_READ_LIMIT
    const end = Math.min(lines.length, offset + limit)

    const selected = lines.slice(offset, end)
    const content = selected.map((line, index) => {
      return `${(index + offset + 1).toString().padStart(5, "0")}| ${line}`
    })
    const preview = selected.slice(0, 20).join("\n")
    const hasMore = lines.length > end

    let output = "<file>\n"
    output += content.join("\n")
    if (hasMore) {
      output += `\n\n(File has more lines. Use 'offset' to read beyond line ${end})`
    } else {
      output += `\n\n(End of file - total ${lines.length} lines)`
    }
    output += "\n</file>"

    return {
      title: title || filePath,
      metadata: {
        preview,
        truncated: hasMore,
      },
      output,
    }
  },
})
