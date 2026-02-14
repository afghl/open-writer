const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
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

function resolveEmbeddingBaseURL() {
  const raw = process.env.OPENAI_BASE_URL?.trim()
  const base = raw && raw.length > 0 ? raw : "https://api.openai.com/v1"
  if (base.endsWith("/v1")) {
    return base
  }
  return `${base.replace(/\/$/, "")}/v1`
}

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>
  error?: {
    message?: string
  }
}

export async function embedTexts(input: {
  texts: string[]
  model?: string
  signal?: AbortSignal
}) {
  if (input.texts.length === 0) {
    return [] as number[][]
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }

  const model = input.model ?? DEFAULT_EMBEDDING_MODEL
  const url = `${resolveEmbeddingBaseURL()}/embeddings`
  const vectors: number[][] = []

  for (let start = 0; start < input.texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = input.texts.slice(start, start + EMBEDDING_BATCH_SIZE)
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: batch,
      }),
      signal: input.signal,
    })

    const payload = await response.json() as EmbeddingResponse
    if (!response.ok) {
      const message = payload.error?.message ?? `Embedding request failed: ${response.status}`
      throw new Error(message)
    }

    const data = payload.data ?? []
    if (data.length !== batch.length) {
      throw new Error("Embedding response size mismatch")
    }

    for (const item of data) {
      if (!Array.isArray(item.embedding) || item.embedding.length === 0) {
        throw new Error("Invalid embedding vector in response")
      }
      vectors.push(item.embedding)
    }
  }

  return vectors
}
