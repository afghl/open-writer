import z from "zod"
import type { MessageWithParts } from "@/session"
import type { PermissionRequest } from "@/permission"

export interface ToolMetadata {
  [key: string]: any
}

export interface ToolInitContext {}

export type ToolContext<M extends ToolMetadata = ToolMetadata> = {
  sessionID: string
  messageID: string
  agent: string
  threadID: string
  projectID: string
  abort: AbortSignal
  callID?: string
  messages: MessageWithParts[]
  metadata(input: { title?: string; metadata?: M }): void
  ask(input: PermissionRequest): Promise<void>
}

export interface ToolInfo<Parameters extends z.ZodType = z.ZodType, M extends ToolMetadata = ToolMetadata> {
  id: string
  init: (ctx?: ToolInitContext) => Promise<{
    description: string
    parameters: Parameters
    execute(
      args: z.infer<Parameters>,
      ctx: ToolContext,
    ): Promise<{
      title: string
      metadata: M
      output: string
    }>
    formatValidationError?(error: z.ZodError): string
  }>
}

export function defineTool<Parameters extends z.ZodType, Result extends ToolMetadata>(
  id: string,
  init: ToolInfo<Parameters, Result>["init"] | Awaited<ReturnType<ToolInfo<Parameters, Result>["init"]>>,
): ToolInfo<Parameters, Result> {
  return {
    id,
    init: async (initCtx: ToolInitContext) => {
      const toolInfo = init instanceof Function ? await init(initCtx) : init
      const execute = toolInfo.execute
      toolInfo.execute = async (args, ctx) => {
        try {
          toolInfo.parameters.parse(args)
        } catch (error) {
          if (error instanceof z.ZodError && toolInfo.formatValidationError) {
            throw new Error(toolInfo.formatValidationError(error), { cause: error })
          }
          throw new Error(
            `The ${id} tool was called with invalid arguments: ${error}.\nPlease rewrite the input so it satisfies the expected schema.`,
            { cause: error },
          )
        }
        return execute(args, ctx)
      }
      return toolInfo
    },
  }
}

export const Tool = {
  define: defineTool,
}
