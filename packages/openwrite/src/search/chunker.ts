import type { SearchChunk } from "./types"

export const CHUNK_MAX_CHARS = 1000
export const CHUNK_OVERLAP = 120

function normalizeSnippet(input: string) {
  const flat = input.replace(/\s+/g, " ").trim()
  if (flat.length <= 220) return flat
  return `${flat.slice(0, 217)}...`
}

function toChunkID(docID: string, index: number) {
  return `${docID}::${index}`
}

function inferDocID(sourcePath: string) {
  const fromPath = sourcePath.match(/--(doc_[a-f0-9]{8,})\.[^./]+$/i)?.[1]
  if (fromPath) {
    return fromPath
  }
  return `doc_${Math.abs(hashCode(sourcePath)).toString(16)}`
}

function hashCode(input: string) {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i)
    hash |= 0
  }
  return hash
}

export function chunkDocument(input: {
  sourcePath: string
  content: string
  maxChars?: number
  overlap?: number
}) {
  const maxChars = input.maxChars ?? CHUNK_MAX_CHARS
  const overlap = input.overlap ?? CHUNK_OVERLAP
  const text = input.content
  if (text.trim().length === 0) {
    return [] as SearchChunk[]
  }

  const docID = inferDocID(input.sourcePath)
  const chunks: SearchChunk[] = []
  const step = Math.max(1, maxChars - overlap)

  let chunkIndex = 0
  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(text.length, start + maxChars)
    const chunkText = text.slice(start, end)

    chunks.push({
      chunk_id: toChunkID(docID, chunkIndex),
      doc_id: docID,
      source_path: input.sourcePath,
      source_text_path: input.sourcePath,
      text: chunkText,
      snippet: normalizeSnippet(chunkText),
      hybrid_score: 0,
      metadata: {
        offset_start: start,
        text_len: chunkText.length,
      },
    })

    chunkIndex += 1
    if (end >= text.length) break
  }

  return chunks
}
