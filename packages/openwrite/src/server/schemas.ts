import { z } from "zod"

export const sessionPromptInput = z.object({
  text: z.string().min(1),
  agent: z.string().min(1).optional(),
})

export const projectCreateInput = z.object({
  title: z.string().min(1).optional(),
})

export const fsTreeInput = z.object({
  path: z.string().optional(),
  depth: z.coerce.number().int().min(0).optional(),
})

export const fsReadInput = z.object({
  path: z.string().min(1),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).optional(),
})

export const fsRawInput = z.object({
  path: z.string().min(1),
})

export const messageListInput = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  last_message_id: z.string().min(1).optional(),
})

export const taskCreateInput = z.object({
  type: z.literal("handoff"),
  input: z.object({
    target_agent_name: z.string().min(1),
  }),
  idempotency_key: z.string().min(1).optional(),
})

export const agenticSearchInput = z.object({
  query: z.string().min(1),
  query_context: z.string().min(1),
})
