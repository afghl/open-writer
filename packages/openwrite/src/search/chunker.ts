import type { ChunkMetadata, SearchChunk } from "./types"

const HEADING_RE = /^#{1,6}\s+(.+)$/
const PAGE_RE = /(?:^|\b)(?:page|p\.)\s*(\d{1,5})(?:\b|$)/i

export const CHUNK_MAX_CHARS = 1000
export const CHUNK_OVERLAP = 120

function buildLineStarts(text: string) {
  const starts = [0]
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      starts.push(i + 1)
    }
  }
  return starts
}

function lineForOffset(lineStarts: number[], offset: number) {
  let low = 0
  let high = lineStarts.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const start = lineStarts[mid]
    const next = mid + 1 < lineStarts.length ? lineStarts[mid + 1] : Number.POSITIVE_INFINITY
    if (offset < start) {
      high = mid - 1
      continue
    }
    if (offset >= next) {
      low = mid + 1
      continue
    }
    return mid + 1
  }
  return lineStarts.length
}

function headingMap(lines: string[]) {
  const map = new Map<number, string>()
  let current = "(root)"
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    const match = line.match(HEADING_RE)
    if (match && match[1]) {
      current = match[1].trim()
    }
    map.set(i + 1, current)
  }
  return map
}

function pageForLine(lines: string[], lineNumber: number) {
  const start = Math.max(1, lineNumber - 8)
  const end = Math.min(lines.length, lineNumber + 8)
  for (let i = start; i <= end; i += 1) {
    const text = lines[i - 1] ?? ""
    const match = text.match(PAGE_RE)
    if (match) {
      const parsed = Number.parseInt(match[1], 10)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return undefined
}

function normalizeSnippet(input: string) {
  const flat = input.replace(/\s+/g, " ").trim()
  if (flat.length <= 220) return flat
  return `${flat.slice(0, 217)}...`
}

function toChunkID(sourcePath: string, start: number, end: number) {
  return `${sourcePath}::${start}-${end}`
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

  const lines = text.split(/\r?\n/)
  const lineStarts = buildLineStarts(text)
  const sectionMap = headingMap(lines)

  const chunks: SearchChunk[] = []
  const step = Math.max(1, maxChars - overlap)

  for (let start = 0; start < text.length; start += step) {
    const end = Math.min(text.length, start + maxChars)
    const chunkText = text.slice(start, end)
    const startLine = lineForOffset(lineStarts, start)
    const endLine = lineForOffset(lineStarts, Math.max(start, end - 1))
    const section = sectionMap.get(startLine) ?? "(root)"

    const metadata: ChunkMetadata = {
      start_line: startLine,
      end_line: endLine,
      section,
      offset_start: start,
      offset_end: end,
      page: pageForLine(lines, startLine),
    }

    chunks.push({
      chunk_id: toChunkID(input.sourcePath, start, end),
      source_path: input.sourcePath,
      text: chunkText,
      snippet: normalizeSnippet(chunkText),
      metadata,
    })

    if (end >= text.length) break
  }

  return chunks
}
