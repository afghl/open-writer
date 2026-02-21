import z from "zod"
import { Tool } from "./tool"
import { normalizeScope, searchCandidates } from "@/search"

const DESCRIPTION =
  "Search candidate chunks from Pinecone hybrid retrieval and return ranked candidates."

const ScopeSchema = z.object({
  paths: z.array(z.string().min(1)).optional(),
  extensions: z.array(z.string().min(1)).optional(),
}).optional()

export const PineconeHybridSearchTool = Tool.define("pinecone_hybrid_search", async () => ({
  description: DESCRIPTION,
  parameters: z.object({
    query: z.string().min(1).describe("Search query text."),
    scope: ScopeSchema.describe("Optional scope (paths/extensions) under inputs/library."),
    k: z.number().int().min(1).max(50).optional().describe("Max candidates to return, default 20."),
  }),
  async execute(params, ctx) {
    const scope = normalizeScope(params.scope)

    await ctx.ask({
      permission: "read",
      patterns: scope.paths,
      always: ["*"],
      metadata: {
        tool: "pinecone_hybrid_search",
        query: params.query,
        scope,
      },
    })

    const result = await searchCandidates({
      projectID: ctx.projectID,
      query: params.query,
      scope,
      k: params.k,
      signal: ctx.abort,
    })

    return {
      title: `pinecone_hybrid_search (${result.candidates.length})`,
      metadata: {
        query: params.query,
        scope,
        stats: result.stats,
      },
      output: JSON.stringify(result, null, 2),
    }
  },
}))
