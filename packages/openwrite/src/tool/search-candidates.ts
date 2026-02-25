import z from "zod"
import { Tool } from "./tool"
import { fetchChunks, rerankEvidence, searchCandidates, type AtomicSearchResult } from "@/search"

const DESCRIPTION =
  "执行原子化 hybrid 检索 + 证据解析 + 重排，并返回最终证据结果。"

const FIXED_RETRIEVE_K = 15
const FIXED_TOP_K = 10

function normalizeUniqueTokens(tokens: string[]) {
  return Array.from(new Set(
    tokens
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  ))
}

export const PineconeHybridSearchTool = Tool.define("pinecone_hybrid_search", async () => ({
  description: DESCRIPTION,
  parameters: z.object({
    query: z.string().min(1).describe("检索查询文本。"),
    doc_ids: z.array(z.string().min(1)).max(100).optional().describe("可选 doc_id 白名单；不传则全量检索。"),
    keywords: z.array(z.string().min(1)).min(1).max(20).describe("稀疏检索关键词列表（必填，去重后不可为空）。"),
  }),
  async execute(params, ctx) {
    const docIDs = normalizeUniqueTokens(params.doc_ids ?? [])
    const keywords = normalizeUniqueTokens(params.keywords)
    if (keywords.length === 0) {
      throw new Error("keywords cannot be empty after normalization")
    }

    await ctx.ask({
      permission: "read",
      patterns: ["inputs/library/**"],
      always: ["*"],
      metadata: {
        tool: "pinecone_hybrid_search",
        query: params.query,
        doc_ids: docIDs,
        keywords,
      },
    })

    const result = await searchCandidates({
      projectID: ctx.projectID,
      query: params.query,
      ...(docIDs.length > 0 ? { docIDs } : {}),
      keywords,
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
      doc_ids: docIDs,
      keywords,
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
        doc_ids: output.doc_ids,
        keywords: output.keywords,
        stats: output.stats,
      },
      output: JSON.stringify(output, null, 2),
    }
  },
}))
