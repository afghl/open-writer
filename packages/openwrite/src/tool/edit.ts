import z from "zod"
import path from "path"
import fs from "fs/promises"
import { Tool } from "./tool"

function resolvePath(inputPath: string) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath)
}

function replaceOnce(content: string, find: string, replaceWith: string) {
  const index = content.indexOf(find)
  if (index === -1) return { found: false, result: content }
  return {
    found: true,
    result: content.slice(0, index) + replaceWith + content.slice(index + find.length),
  }
}

export const EditTool = Tool.define("edit", {
  description: "Edit a file by replacing a text block.",
  parameters: z.object({
    filePath: z.string().describe("The path to the file to modify"),
    oldString: z.string().describe("The text to replace"),
    newString: z.string().describe("The text to replace it with"),
    replaceAll: z.boolean().optional().describe("Replace all occurrences (default false)"),
  }),
  async execute(params, ctx) {
    if (params.oldString === params.newString) {
      throw new Error("oldString and newString must be different")
    }

    const filePath = resolvePath(params.filePath)
    const title = path.relative(process.cwd(), filePath)

    await ctx.ask({
      permission: "edit",
      patterns: [filePath],
      always: ["*"],
      metadata: {},
    })

    if (params.oldString === "") {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, params.newString, "utf8")
      return {
        title: title || filePath,
        metadata: { created: true },
        output: "File written successfully.",
      }
    }

    let content
    try {
      content = await fs.readFile(filePath, "utf8")
    } catch {
      throw new Error(`File not found: ${filePath}`)
    }

    let result = content
    let found = false
    if (params.replaceAll) {
      found = content.includes(params.oldString)
      result = content.split(params.oldString).join(params.newString)
    } else {
      const replaced = replaceOnce(content, params.oldString, params.newString)
      found = replaced.found
      result = replaced.result
    }

    if (!found) {
      throw new Error("oldString not found in file.")
    }

    await fs.writeFile(filePath, result, "utf8")

    return {
      title: title || filePath,
      metadata: { updated: true },
      output: "Edit applied successfully.",
    }
  },
})
