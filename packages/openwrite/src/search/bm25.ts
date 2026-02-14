const K1 = 1.2
const B = 0.75

export type BM25Document = {
  chunk_id: string
  tokens: string[]
}

export type BM25Hit = {
  chunk_id: string
  score: number
  rank: number
}

export class BM25Index {
  private readonly documents: BM25Document[]
  private readonly termFreqByDoc = new Map<string, Map<string, number>>()
  private readonly docFreq = new Map<string, number>()
  private readonly docLength = new Map<string, number>()
  private readonly avgDocLength: number

  constructor(documents: BM25Document[]) {
    this.documents = documents

    let totalLength = 0
    for (const doc of documents) {
      const freq = new Map<string, number>()
      for (const token of doc.tokens) {
        freq.set(token, (freq.get(token) ?? 0) + 1)
      }
      this.termFreqByDoc.set(doc.chunk_id, freq)
      this.docLength.set(doc.chunk_id, doc.tokens.length)
      totalLength += doc.tokens.length

      for (const token of new Set(doc.tokens)) {
        this.docFreq.set(token, (this.docFreq.get(token) ?? 0) + 1)
      }
    }

    this.avgDocLength = documents.length > 0 ? totalLength / documents.length : 0
  }

  private idf(token: string) {
    const totalDocs = this.documents.length
    if (totalDocs === 0) return 0
    const df = this.docFreq.get(token) ?? 0
    return Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5))
  }

  search(queryTokens: string[], limit: number, includeIDs?: Set<string>) {
    const deduped = Array.from(new Set(queryTokens))
    const scores = new Map<string, number>()

    for (const doc of this.documents) {
      if (includeIDs && !includeIDs.has(doc.chunk_id)) {
        continue
      }
      const tf = this.termFreqByDoc.get(doc.chunk_id)
      if (!tf) continue
      const length = this.docLength.get(doc.chunk_id) ?? 0
      if (length === 0) continue

      let score = 0
      for (const token of deduped) {
        const freq = tf.get(token) ?? 0
        if (freq <= 0) continue

        const idf = this.idf(token)
        const numerator = freq * (K1 + 1)
        const denominator = freq + K1 * (1 - B + B * (length / Math.max(this.avgDocLength, 1e-9)))
        score += idf * (numerator / denominator)
      }
      if (score > 0) {
        scores.set(doc.chunk_id, score)
      }
    }

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([chunk_id, score], index) => ({
        chunk_id,
        score,
        rank: index + 1,
      })) satisfies BM25Hit[]
  }
}
