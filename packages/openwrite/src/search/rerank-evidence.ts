import z from "zod"
import { LLM } from "@/llm"
import type { CandidateChunk, RerankedEvidence, SearchChunk } from "./types"
import RERANK_SYSTEM_PROMPT_TEMPLATE from "./rerank-evidence.txt"

const DEFAULT_TEXT_CHAR_LIMIT = 1_500

const RerankResultSchema = z.object({
  results: z.array(z.object({
    reason: z.string(),
    relevance: z.number().min(0).max(1),
    chunk_id: z.string(),
  })),
})

type JoinedEvidence = {
  candidate: CandidateChunk
  chunk: SearchChunk
}

type Ranked = {
  chunk_id: string
  relevance: number
  reason: string
  rank: number
}

type RerankOutput = {
  results: Ranked[]
  fallback: boolean
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function clipText(input: string, limit: number) {
  if (input.length <= limit) {
    return input
  }
  return `${input.slice(0, Math.max(0, limit - 3))}...`
}

function fallbackRanking(
  joined: JoinedEvidence[],
  topK: number,
  reason: string,
): RerankOutput {
  const fallbackReason = `LLM 重排失败，回退到 hybrid_score 排序：${reason}`
  const results = [...joined]
    .sort((a, b) => b.candidate.hybrid_score - a.candidate.hybrid_score)
    .slice(0, topK)
    .map((item, index) => ({
      chunk_id: item.candidate.chunk_id,
      relevance: clamp01(item.candidate.hybrid_score),
      reason: fallbackReason,
      rank: index + 1,
    }))

  return {
    results,
    fallback: true,
  }
}

async function rerankByLLM(input: {
  query: string
  joined: JoinedEvidence[]
  topK: number
  signal?: AbortSignal
  textCharLimit: number
}): Promise<RerankOutput> {
  const llm = LLM.for("tool.rerank")
  const systemPrompt = RERANK_SYSTEM_PROMPT_TEMPLATE
    .replaceAll("{{TOP_K}}", String(input.topK))
  const promptCandidates = input.joined
    .map((item, index) => [
      `候选 ${index + 1}`,
      `chunk_id: ${item.candidate.chunk_id}`,
      `hybrid_score: ${item.candidate.hybrid_score}`,
      `text: ${clipText(item.chunk.text, input.textCharLimit)}`,
    ].join("\n"))
    .join("\n\n")

  const response = await llm.generateText({
    model: llm.model,
    abortSignal: input.signal,
    system: systemPrompt,
    prompt: [
      `查询目标: ${input.query}`,
      "候选证据:",
      promptCandidates,
    ].join("\n\n"),
  })

  const parsed = JSON.parse(response.text) as unknown
  const validated = RerankResultSchema.parse(parsed)
  const allowed = new Set(input.joined.map((item) => item.candidate.chunk_id))
  const seen = new Set<string>()

  const llmResults = validated.results
    .filter((item) => {
      if (!allowed.has(item.chunk_id)) return false
      if (seen.has(item.chunk_id)) return false
      seen.add(item.chunk_id)
      return true
    })

  if (llmResults.length === 0) {
    throw new Error("Reranker returned no valid chunk IDs")
  }

  const remaining = [...input.joined]
    .sort((a, b) => b.candidate.hybrid_score - a.candidate.hybrid_score)
    .filter((item) => !seen.has(item.candidate.chunk_id))
    .map((item) => ({
      reason: "模型结果不足，按 hybrid_score 自动补位。",
      relevance: clamp01(item.candidate.hybrid_score),
      chunk_id: item.candidate.chunk_id,
    }))

  const merged = [...llmResults, ...remaining]
    .slice(0, input.topK)
    .map((item, index) => ({
      reason: item.reason,
      relevance: item.relevance,
      chunk_id: item.chunk_id,
      rank: index + 1,
    }))

  return {
    results: merged,
    fallback: false,
  }
}

function mapRankedToEvidence(
  ranking: Ranked[],
  joinedByID: Map<string, JoinedEvidence>,
): RerankedEvidence[] {
  return ranking
    .map((item) => {
      const joined = joinedByID.get(item.chunk_id)
      if (!joined) return undefined

      return {
        rank: item.rank,
        chunk_id: joined.candidate.chunk_id,
        source_path: joined.candidate.source_path,
        relevance: item.relevance,
        reason: item.reason,
        text: joined.chunk.text,
      }
    })
    .filter((item): item is RerankedEvidence => !!item)
}

export async function rerankEvidence(input: {
  query: string
  candidates: CandidateChunk[]
  chunks: SearchChunk[]
  topK: number
  signal?: AbortSignal
  textCharLimit?: number
}) {
  if (input.candidates.length === 0) {
    return {
      results: [] as RerankedEvidence[],
      missing_chunk_ids: [] as string[],
      fallback: false,
    }
  }

  const topK = Math.max(1, Math.min(50, input.topK))
  const textCharLimit = Math.max(200, input.textCharLimit ?? DEFAULT_TEXT_CHAR_LIMIT)
  const chunkByID = new Map(input.chunks.map((chunk) => [chunk.chunk_id, chunk]))
  const joined: JoinedEvidence[] = []
  const missingChunkIDs: string[] = []

  for (const candidate of input.candidates) {
    const chunk = chunkByID.get(candidate.chunk_id)
    if (!chunk) {
      missingChunkIDs.push(candidate.chunk_id)
      continue
    }
    joined.push({ candidate, chunk })
  }

  if (joined.length === 0) {
    return {
      results: [] as RerankedEvidence[],
      missing_chunk_ids: Array.from(new Set(missingChunkIDs)),
      fallback: true,
    }
  }

  let ranking: RerankOutput
  try {
    ranking = await rerankByLLM({
      query: input.query,
      joined,
      topK: Math.min(topK, joined.length),
      signal: input.signal,
      textCharLimit,
    })
  } catch (error) {
    ranking = fallbackRanking(
      joined,
      Math.min(topK, joined.length),
      error instanceof Error ? error.message : String(error),
    )
  }

  const joinedByID = new Map(joined.map((item) => [item.candidate.chunk_id, item]))
  const results = mapRankedToEvidence(ranking.results, joinedByID)

  return {
    results,
    missing_chunk_ids: Array.from(new Set(missingChunkIDs)),
    fallback: ranking.fallback,
  }
}
