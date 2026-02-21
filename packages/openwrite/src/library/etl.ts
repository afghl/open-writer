import { createHash } from "node:crypto"
import { LibraryServiceError, type ChunkRecord, type EmbeddingRecord } from "./types"
import { LLM } from "@/llm"

const DEFAULT_CHUNK_SIZE = 1000
const DEFAULT_CHUNK_OVERLAP = 120

function makeSnippet(input: string) {
  const flat = input.replace(/\s+/g, " ").trim()
  if (flat.length <= 220) {
    return flat
  }
  return `${flat.slice(0, 217)}...`
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
  const source = input.text
  if (source.trim().length === 0) {
    throw new LibraryServiceError("EMPTY_TEXT", "Parsed text is empty")
  }

  const chunks: ChunkRecord[] = []
  const step = Math.max(1, chunkSize - overlap)
  let chunkIndex = 0
  for (let start = 0; start < source.length; start += step) {
    const end = Math.min(source.length, start + chunkSize)
    const text = source.slice(start, end)
    if (text.length === 0) {
      break
    }
    chunks.push({
      id: `${input.docID}::${chunkIndex}`,
      text,
      index: chunkIndex,
      offset_start: start,
      text_len: text.length,
      snippet: makeSnippet(text),
    })
    chunkIndex += 1
    if (end >= source.length) {
      break
    }
  }

  if (chunks.length === 0) {
    throw new LibraryServiceError("EMPTY_CHUNKS", "Failed to produce chunks")
  }
  return chunks
}

export async function embedChunks(input: {
  chunks: ChunkRecord[]
  requireRemoteEmbedding: boolean
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

  const llm = LLM.for("library.embedding")

  const result = await Promise.race([
    llm.embedMany({
      model: llm.model,
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
