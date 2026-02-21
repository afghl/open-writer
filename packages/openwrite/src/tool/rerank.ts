import z from "zod"
import { Tool } from "./tool"
import { LLM } from "@/llm"

const DESCRIPTION = "Rerank candidate chunks with LLM reasoning and return top-k evidence."

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
      `Candidate ${index + 1}`,
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
      "You are a retrieval reranker.",
      "Return strict JSON only.",
      "Output schema: {\"results\":[{\"chunk_id\":string,\"relevance\":number(0..1),\"reason\":string}]}",
      `Return at most ${input.topK} results.`,
      "Keep reasons concise and evidence-focused.",
    ].join("\n"),
    prompt: [
      `Query: ${input.query}`,
      "Candidates:",
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
    query: z.string().min(1).describe("The search query."),
    candidates: z.array(CandidateSchema).min(1)
      .describe("Candidate chunks from pinecone_hybrid_search."),
    k: z.number().int().min(1).max(20).optional().describe("Top K results; defaults to min(10, candidate count)."),
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
