import z from "zod"
import { Tool } from "./tool"
import { LLM } from "@/llm"

const DESCRIPTION = "使用 LLM 推理对候选 chunk 进行重排，并返回 top-k 证据。"

const CandidateSchema = z.object({
  chunk_id: z.string().min(1),
  source_path: z.string().min(1),
  snippet: z.string(),
  hybrid_score: z.number().optional(),
  fused_score: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

const RerankResultSchema = z.object({
  results: z.array(z.object({
    chunk_id: z.string(),
    relevance: z.number().min(0).max(1),
    reason: z.string(),
  })),
})

type Candidate = z.infer<typeof CandidateSchema>

type Ranked = {
  chunk_id: string
  relevance: number
  reason: string
  rank: number
}

function candidateBaseScore(item: Candidate) {
  if (typeof item.hybrid_score === "number") {
    return item.hybrid_score
  }
  return item.fused_score ?? 0
}

function fallbackRanking(candidates: Candidate[], topK: number, reason: string) {
  const fallback = [...candidates]
    .sort((a, b) => candidateBaseScore(b) - candidateBaseScore(a))
    .slice(0, topK)
    .map((item, index) => ({
      chunk_id: item.chunk_id,
      relevance: Math.max(0, Math.min(1, candidateBaseScore(item))),
      reason,
      rank: index + 1,
    }))

  return {
    results: fallback,
    fallback: true,
  }
}

async function rerankByLLM(input: {
  query: string
  candidates: Candidate[]
  topK: number
  signal?: AbortSignal
}) {
  const llm = LLM.for("tool.rerank")
  const content = input.candidates
    .map((item, index) => [
      `候选 ${index + 1}`,
      `chunk_id: ${item.chunk_id}`,
      `source_path: ${item.source_path}`,
      `hybrid_score: ${candidateBaseScore(item)}`,
      `snippet: ${item.snippet}`,
    ].join("\n"))
    .join("\n\n")

  const response = await llm.generateText({
    model: llm.model,
    abortSignal: input.signal,
    system: [
      "你是检索重排器。",
      "仅返回严格的 JSON。",
      "输出结构：{\"results\":[{\"chunk_id\":string,\"relevance\":number(0..1),\"reason\":string}]}",
      `最多返回 ${input.topK} 条结果。`,
      "reason 字段要简洁且聚焦证据。",
    ].join("\n"),
    prompt: [
      `查询：${input.query}`,
      "候选项：",
      content,
    ].join("\n\n"),
  })

  const parsed = JSON.parse(response.text) as unknown
  const validated = RerankResultSchema.parse(parsed)

  const seen = new Set<string>()
  const filtered = validated.results
    .filter((item) => {
      if (seen.has(item.chunk_id)) return false
      if (!input.candidates.some((candidate) => candidate.chunk_id === item.chunk_id)) return false
      seen.add(item.chunk_id)
      return true
    })
    .slice(0, input.topK)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }))

  return {
    results: filtered,
    fallback: false,
  }
}

export const RerankTool = Tool.define("rerank", async () => ({
  description: DESCRIPTION,
  parameters: z.object({
    query: z.string().min(1).describe("检索查询。"),
    candidates: z.array(CandidateSchema).min(1)
      .describe("来自 pinecone_hybrid_search 的候选 chunk。"),
    k: z.number().int().min(1).max(20).optional().describe("返回前 K 条结果；默认值为 min(10, candidate 数量)。"),
  }),
  async execute(params, ctx) {
    const topK = Math.min(params.k ?? 10, params.candidates.length, 20)

    let ranking: { results: Ranked[]; fallback: boolean }
    try {
      ranking = await rerankByLLM({
        query: params.query,
        candidates: params.candidates,
        topK,
        signal: ctx.abort,
      })
    } catch (error) {
      ranking = fallbackRanking(params.candidates, topK, error instanceof Error ? error.message : String(error))
    }

    return {
      title: `rerank (${ranking.results.length})`,
      metadata: {
        query: params.query,
        requested: params.candidates.length,
        topK,
        fallback: ranking.fallback,
      },
      output: JSON.stringify(ranking, null, 2),
    }
  },
}))
