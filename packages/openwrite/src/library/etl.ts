import { createHash } from "node:crypto"
import { createOpenAI } from "@ai-sdk/openai"
import { embedMany } from "ai"
import { LibraryServiceError, type ChunkRecord, type EmbeddingRecord } from "./types"

const DEFAULT_CHUNK_SIZE = 800
const DEFAULT_CHUNK_OVERLAP = 120

function tokenize(input: string) {
  return input
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((item) => item.length > 0)
}

function deterministicVector(input: string, dimensions = 256) {
  const values = new Array(dimensions).fill(0)
  const hash = createHash("sha1").update(input).digest()
  for (let i = 0; i < dimensions; i += 1) {
    values[i] = ((hash[i % hash.length] ?? 0) / 255) * 2 - 1
  }
  return values
}

export function chunkText(input: {
  docID: string
  text: string
  chunkSize?: number
  overlap?: number
}): ChunkRecord[] {
  const chunkSize = Math.max(200, input.chunkSize ?? DEFAULT_CHUNK_SIZE)
  const overlap = Math.max(0, Math.min(chunkSize - 1, input.overlap ?? DEFAULT_CHUNK_OVERLAP))

  const tokens = tokenize(input.text)
  if (tokens.length === 0) {
    throw new LibraryServiceError("EMPTY_TEXT", "Parsed text is empty")
  }

  const chunks: ChunkRecord[] = []
  let cursor = 0
  let chunkIndex = 0
  while (cursor < tokens.length) {
    const slice = tokens.slice(cursor, cursor + chunkSize)
    const text = slice.join(" ").trim()
    if (text.length > 0) {
      chunks.push({
        id: `${input.docID}::${chunkIndex}`,
        text,
        index: chunkIndex,
      })
      chunkIndex += 1
    }
    if (cursor + chunkSize >= tokens.length) {
      break
    }
    cursor += Math.max(1, chunkSize - overlap)
  }

  if (chunks.length === 0) {
    throw new LibraryServiceError("EMPTY_CHUNKS", "Failed to produce chunks")
  }
  return chunks
}

export async function embedChunks(input: {
  chunks: ChunkRecord[]
  requireRemoteEmbedding: boolean
  modelID?: string
}): Promise<EmbeddingRecord[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? ""
  if (!apiKey) {
    if (input.requireRemoteEmbedding) {
      throw new LibraryServiceError(
        "EMBEDDING_CONFIG_MISSING",
        "OPENAI_API_KEY is required when Pinecone is enabled",
      )
    }
    return input.chunks.map((chunk) => ({
      id: chunk.id,
      values: deterministicVector(chunk.text),
    }))
  }

  const provider = createOpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
  })
  const model = provider.textEmbeddingModel(input.modelID?.trim() || process.env.OW_EMBEDDING_MODEL?.trim() || "text-embedding-3-small")

  const result = await Promise.race([
    embedMany({
      model,
      values: input.chunks.map((chunk) => chunk.text),
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new LibraryServiceError("EMBEDDING_TIMEOUT", "Embedding request timed out")), 20_000)
    }),
  ])

  if (!result.embeddings || result.embeddings.length !== input.chunks.length) {
    throw new LibraryServiceError("EMBEDDING_FAILED", "Embedding output size mismatch")
  }

  return result.embeddings.map((values, index) => ({
    id: input.chunks[index]!.id,
    values,
  }))
}
