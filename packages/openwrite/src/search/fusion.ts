export const RRF_K = 60

export type RankedScore = {
  chunk_id: string
  rank: number
  score: number
}

export function rrfFuse(input: {
  bm25: RankedScore[]
  vector: RankedScore[]
  k?: number
}) {
  const k = input.k ?? RRF_K
  const bm25ByID = new Map(input.bm25.map((item) => [item.chunk_id, item]))
  const vectorByID = new Map(input.vector.map((item) => [item.chunk_id, item]))

  const allIDs = new Set<string>([
    ...bm25ByID.keys(),
    ...vectorByID.keys(),
  ])

  return Array.from(allIDs)
    .map((chunkID) => {
      const bm25 = bm25ByID.get(chunkID)
      const vector = vectorByID.get(chunkID)
      const fused =
        (bm25 ? 1 / (k + bm25.rank) : 0)
        + (vector ? 1 / (k + vector.rank) : 0)

      return {
        chunk_id: chunkID,
        bm25_score: bm25?.score ?? null,
        vector_score: vector?.score ?? null,
        fused_score: fused,
      }
    })
    .sort((a, b) => b.fused_score - a.fused_score)
}
