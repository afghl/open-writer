import z from "zod"
import { Tool } from "./tool"
import { fetchChunks, normalizeScope, rerankEvidence, searchCandidates, type AtomicSearchResult } from "@/search"

const DESCRIPTION =
  "Run atomic hybrid retrieval + evidence resolution + reranking and return final evidence results."

const FIXED_RETRIEVE_K = 15
const FIXED_TOP_K = 10

const ScopeSchema = z.object({
  paths: z.array(z.string().min(1)).optional(),
  extensions: z.array(z.string().min(1)).optional(),
}).optional()

export const PineconeHybridSearchTool = Tool.define("pinecone_hybrid_search", async () => ({
  description: DESCRIPTION,
  parameters: z.object({
    query: z.string().min(1).describe("Search query text."),
    scope: ScopeSchema.describe("Optional scope (paths/extensions) under inputs/library."),
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
      k: FIXED_RETRIEVE_K,
      signal: ctx.abort,
    })

    const fetchResult = await fetchChunks({
      projectID: ctx.projectID,
      chunkIDs: result.candidates.map((item) => item.chunk_id),
    })

    const rerankResult = await rerankEvidence({
      query: params.query,
      candidates: result.candidates,
      chunks: fetchResult.chunks,
      topK: FIXED_TOP_K,
      signal: ctx.abort,
    })

    const missingChunkIDs = Array.from(new Set([
      ...fetchResult.missing_chunk_ids,
      ...rerankResult.missing_chunk_ids,
    ]))

    const output: AtomicSearchResult = {
      query: params.query,
      scope,
      results: rerankResult.results,
      missing_chunk_ids: missingChunkIDs,
      stats: {
        backend: result.stats.backend,
        candidate_hits: result.stats.candidate_hits,
        retrieved_candidates: result.candidates.length,
        resolved_chunks: fetchResult.chunks.length,
        fallback: rerankResult.fallback,
      },
    }

    return {
      title: `pinecone_hybrid_search (${output.results.length})`,
      metadata: {
        query: params.query,
        scope,
        stats: output.stats,
      },
      output: JSON.stringify(output, null, 2),
    }
  },
}))
