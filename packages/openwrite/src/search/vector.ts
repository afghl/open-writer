import { LLM } from "@/llm"

const EMBEDDING_BATCH_SIZE = 32

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0
  }

  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i]
    leftNorm += left[i] * left[i]
    rightNorm += right[i] * right[i]
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

export async function embedTexts(input: {
  texts: string[]
  signal?: AbortSignal
}) {
  if (input.texts.length === 0) {
    return [] as number[][]
  }

  const llm = LLM.embedding("search.embedding")
  const vectors: number[][] = []

  for (let start = 0; start < input.texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = input.texts.slice(start, start + EMBEDDING_BATCH_SIZE)
    const result = await llm.embedMany({
      model: llm.model,
      values: batch,
      abortSignal: input.signal,
    })
    const data = result.embeddings ?? []
    if (data.length !== batch.length) {
      throw new Error("Embedding response size mismatch")
    }

    for (const embedding of data) {
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error("Invalid embedding vector in response")
      }
      vectors.push(embedding)
    }
  }

  return vectors
}
