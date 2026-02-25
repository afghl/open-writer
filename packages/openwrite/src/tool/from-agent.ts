import z from "zod"
import type { ToolContext, ToolInfo, ToolMetadata } from "./tool"

export type AgentArtifactPolicy = {
  defaultDir: string
  keepLatest?: boolean
  fileName?: (input: { runID: string; createdAt: string }) => string
}

export interface AgentToolBridgeSpec<
  Parameters extends z.ZodType = z.ZodType,
  RunResult = unknown,
  Metadata extends ToolMetadata = ToolMetadata,
> {
  id: string
  targetAgentID: string
  description: string
  parametersSchema: Parameters
  buildPrompt(args: z.infer<Parameters>, ctx: ToolContext): string
  maxSteps?(args: z.infer<Parameters>): number | undefined
  artifactPolicy?: AgentArtifactPolicy
  run(input: {
    args: z.infer<Parameters>
    ctx: ToolContext
    targetAgentID: string
    prompt: string
    maxSteps?: number
    artifactPolicy?: AgentArtifactPolicy
  }): Promise<RunResult>
  formatOutput(input: {
    runResult: RunResult
    args: z.infer<Parameters>
    ctx: ToolContext
  }): Promise<{
    title: string
    metadata: Metadata
    output: string
  }> | {
    title: string
    metadata: Metadata
    output: string
  }
  formatValidationError?(error: z.ZodError): string
}

export function fromAgent<
  Parameters extends z.ZodType,
  RunResult,
  Metadata extends ToolMetadata,
>(
  spec: AgentToolBridgeSpec<Parameters, RunResult, Metadata>,
): ToolInfo<Parameters, Metadata> {
  return {
    id: spec.id,
    init: async () => ({
      description: spec.description,
      parameters: spec.parametersSchema,
      async execute(rawArgs, ctx) {
        let args: z.infer<Parameters>
        try {
          args = spec.parametersSchema.parse(rawArgs)
        } catch (error) {
          if (error instanceof z.ZodError && spec.formatValidationError) {
            throw new Error(spec.formatValidationError(error), { cause: error })
          }
          throw new Error(
            `工具 ${spec.id} 的调用参数无效：${error}。\n请重写输入，使其满足预期的 schema。`,
            { cause: error },
          )
        }

        const prompt = spec.buildPrompt(args, ctx)
        const maxSteps = spec.maxSteps?.(args)
        const runResult = await spec.run({
          args,
          ctx,
          targetAgentID: spec.targetAgentID,
          prompt,
          maxSteps,
          artifactPolicy: spec.artifactPolicy,
        })
        return spec.formatOutput({
          runResult,
          args,
          ctx,
        })
      },
      ...(spec.formatValidationError
        ? { formatValidationError: spec.formatValidationError }
        : {}),
    }),
  }
}
