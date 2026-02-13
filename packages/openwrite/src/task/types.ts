import { z } from "zod"

export namespace Task {
  export const Type = z.enum(["handoff"])
  export type Type = z.infer<typeof Type>

  export const Status = z.enum(["processing", "success", "fail"])
  export type Status = z.infer<typeof Status>

  export const Source = z.enum(["api", "agent_tool"])
  export type Source = z.infer<typeof Source>

  export const Error = z.object({
    code: z.string(),
    message: z.string(),
  })
  export type Error = z.infer<typeof Error>

  export const Input = z.record(z.string(), z.any())
  export type Input = z.infer<typeof Input>

  export const Output = z.record(z.string(), z.any())
  export type Output = z.infer<typeof Output>

  export const Info = z.object({
    id: z.string(),
    project_id: z.string(),
    session_id: z.string(),
    type: Type,
    status: Status,
    source: Source,
    created_by_agent: z.string().optional(),
    created_by_run_id: z.string().optional(),
    idempotency_key: z.string(),
    input: Input,
    output: Output.optional(),
    error: Error.optional(),
    time: z.object({
      created: z.number(),
      started: z.number().optional(),
      finished: z.number().optional(),
    }),
  })
  export type Info = z.infer<typeof Info>
}
