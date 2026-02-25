import { createHash } from "node:crypto"
import { PDFParse } from "pdf-parse"
import { YoutubeTranscript } from "youtube-transcript"
import { LibraryServiceError, type LibraryFileExt } from "./types"

export type ParsedSource = {
  sourceType: "file" | "youtube"
  text: string
  canonicalURL?: string
  videoID?: string
}

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]

function normalizeNewlines(input: string) {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

export function inferFileExt(fileName: string) {
  const lower = fileName.trim().toLowerCase()
  if (lower.endsWith(".pdf")) return "pdf" as const
  if (lower.endsWith(".txt")) return "txt" as const
  if (lower.endsWith(".md")) return "md" as const
  return undefined
}

export function ensureAllowedFileExt(fileName: string): LibraryFileExt {
  const ext = inferFileExt(fileName)
  if (!ext) {
    throw new LibraryServiceError(
      "UNSUPPORTED_FILE_TYPE",
      `Only PDF, TXT, or MD files are allowed: ${fileName}`,
    )
  }
  return ext
}

export function parseYouTubeURL(rawURL: string) {
  let parsed: URL
  try {
    parsed = new URL(rawURL)
  } catch {
    throw new LibraryServiceError("INVALID_URL", `Invalid URL: ${rawURL}`)
  }

  const host = parsed.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.includes(host)) {
    throw new LibraryServiceError("UNSUPPORTED_URL", "Only YouTube URL is supported")
  }

  let videoID = ""
  if (host === "youtu.be" || host === "www.youtu.be") {
    videoID = parsed.pathname.split("/").filter(Boolean)[0] ?? ""
  } else {
    const fromQuery = parsed.searchParams.get("v")?.trim() ?? ""
    if (fromQuery) {
      videoID = fromQuery
    } else {
      const parts = parsed.pathname.split("/").filter(Boolean)
      if (parts.length >= 2 && (parts[0] === "shorts" || parts[0] === "embed")) {
        videoID = parts[1] ?? ""
      }
    }
  }

  if (!videoID) {
    throw new LibraryServiceError("INVALID_YOUTUBE_URL", "Unable to parse YouTube video ID")
  }

  return {
    videoID,
    canonicalURL: `https://www.youtube.com/watch?v=${videoID}`,
  }
}

export async function parseFileBuffer(input: {
  ext: LibraryFileExt
  buffer: Buffer
}): Promise<ParsedSource> {
  if (input.ext === "txt" || input.ext === "md") {
    const text = normalizeNewlines(input.buffer.toString("utf8")).trim()
    if (!text) {
      throw new LibraryServiceError("EMPTY_TEXT", "The uploaded TXT/MD file is empty")
    }
    return {
      sourceType: "file",
      text,
    }
  }

  let extracted = ""
  try {
    const parser = new PDFParse({
      data: new Uint8Array(input.buffer),
    })
    try {
      const result = await parser.getText()
      extracted = normalizeNewlines(result.text ?? "").trim()
    } finally {
      await parser.destroy().catch(() => {})
    }
  } catch (error) {
    throw new LibraryServiceError(
      "PDF_PARSE_FAILED",
      error instanceof Error ? error.message : "Failed to parse PDF",
    )
  }
  if (!extracted) {
    throw new LibraryServiceError("EMPTY_TEXT", "No extractable text found in PDF")
  }

  return {
    sourceType: "file",
    text: extracted,
  }
}

export async function parseYouTubeTranscript(rawURL: string): Promise<ParsedSource> {
  const { videoID, canonicalURL } = parseYouTubeURL(rawURL)

  let transcriptLines: Array<{ text?: string }> = []
  try {
    transcriptLines = await YoutubeTranscript.fetchTranscript(canonicalURL)
  } catch {
    throw new LibraryServiceError(
      "YOUTUBE_TRANSCRIPT_UNAVAILABLE",
      "Unable to fetch YouTube transcript",
    )
  }

  const text = transcriptLines
    .map((line) => (line.text ?? "").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim()

  if (!text) {
    throw new LibraryServiceError(
      "YOUTUBE_TRANSCRIPT_UNAVAILABLE",
      "YouTube transcript is empty",
    )
  }

  return {
    sourceType: "youtube",
    text,
    canonicalURL,
    videoID,
  }
}

export function makeShortHash(input: string) {
  return createHash("sha1").update(input).digest("hex").slice(0, 8)
}
