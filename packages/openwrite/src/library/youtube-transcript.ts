import {
  Supadata,
  SupadataError,
  type Transcript,
  type TranscriptChunk,
  type TranscriptOrJobId,
} from "@supadata/js"
import { Log } from "@/util/log"
import { LibraryServiceError } from "./types"

const DEFAULT_POLL_INTERVAL_MS = 1_500
const DEFAULT_TIMEOUT_MS = 120_000

type SupadataClient = Pick<Supadata, "metadata" | "transcript">

export type YouTubeTranscriptDeps = {
  apiKey?: string
  client?: SupadataClient
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  pollIntervalMs?: number
  timeoutMs?: number
}

function toCanonicalYouTubeURL(videoID: string) {
  return `https://www.youtube.com/watch?v=${videoID}`
}

function normalizeNewlines(input: string) {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

function normalizeLine(input: string) {
  return input.replace(/\s+/g, " ").trim()
}

function normalizeTranscriptText(input: string) {
  return normalizeNewlines(input).trim()
}

function resolveSupadataAPIKey(override?: string) {
  const key = (override ?? process.env.SUPADATA_API_KEY ?? "").trim()
  if (!key) {
    throw new LibraryServiceError("YOUTUBE_TRANSCRIPT_CONFIG_ERROR", "SUPADATA_API_KEY is not set")
  }
  return key
}

function getSupadataClient(deps?: YouTubeTranscriptDeps): SupadataClient {
  if (deps?.client) return deps.client
  return new Supadata({ apiKey: resolveSupadataAPIKey(deps?.apiKey) })
}

function asTranscriptText(content: Transcript["content"]) {
  if (typeof content === "string") {
    return normalizeTranscriptText(content)
  }
  if (Array.isArray(content)) {
    return normalizeTranscriptText(content
      .map((chunk: TranscriptChunk) => chunk.text.trim())
      .filter((line) => line.length > 0)
      .join("\n"))
  }
  return ""
}

async function pollTranscriptJob(
  client: SupadataClient,
  jobID: string,
  deps?: YouTubeTranscriptDeps,
): Promise<Transcript> {
  const now = deps?.now ?? Date.now
  const sleep = deps?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const pollIntervalMs = deps?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
  const timeoutMs = deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const startedAt = now()

  for (;;) {
    if (now() - startedAt > timeoutMs) {
      throw new LibraryServiceError(
        "YOUTUBE_TRANSCRIPT_UNAVAILABLE",
        "YouTube transcript request timed out",
      )
    }

    const status = await client.transcript.getJobStatus(jobID)
    if (status.status === "completed") {
      if (!status.result) {
        throw new LibraryServiceError(
          "YOUTUBE_TRANSCRIPT_UNAVAILABLE",
          "YouTube transcript is unavailable",
        )
      }
      return status.result
    }
    if (status.status === "failed") {
      throw new LibraryServiceError(
        "YOUTUBE_TRANSCRIPT_UNAVAILABLE",
        "YouTube transcript is unavailable",
      )
    }

    await sleep(pollIntervalMs)
  }
}

async function resolveTranscript(
  client: SupadataClient,
  result: TranscriptOrJobId,
  deps?: YouTubeTranscriptDeps,
) {
  if ("jobId" in result) {
    return pollTranscriptJob(client, result.jobId, deps)
  }
  return result
}

export async function loadYouTubeTranscriptTextByVideoID(
  videoID: string,
  deps?: YouTubeTranscriptDeps,
): Promise<string> {
  const normalizedVideoID = videoID.trim()
  if (!normalizedVideoID) {
    throw new LibraryServiceError("INVALID_YOUTUBE_URL", "Unable to parse YouTube video ID")
  }

  const canonicalURL = toCanonicalYouTubeURL(normalizedVideoID)
  let client: SupadataClient
  try {
    client = getSupadataClient(deps)
  } catch (error) {
    if (error instanceof LibraryServiceError) throw error
    throw new LibraryServiceError("YOUTUBE_TRANSCRIPT_CONFIG_ERROR", "SUPADATA_API_KEY is invalid")
  }

  try {
    const transcriptResult = await client.transcript({
      url: canonicalURL,
      text: true,
      mode: "auto",
    })
    const transcript = await resolveTranscript(client, transcriptResult, deps)
    const text = asTranscriptText(transcript.content)
    if (!text) {
      throw new LibraryServiceError("YOUTUBE_TRANSCRIPT_UNAVAILABLE", "YouTube transcript is empty")
    }
    return text
  } catch (error) {
    if (error instanceof LibraryServiceError) throw error
    if (error instanceof SupadataError && error.error === "unauthorized") {
      throw new LibraryServiceError("YOUTUBE_TRANSCRIPT_CONFIG_ERROR", "SUPADATA_API_KEY is invalid")
    }

    Log.Default.error("Unable to fetch YouTube transcript from Supadata", {
      videoID: normalizedVideoID,
      canonicalURL,
      error,
    })
    throw new LibraryServiceError(
      "YOUTUBE_TRANSCRIPT_UNAVAILABLE",
      "Unable to fetch YouTube transcript",
    )
  }
}

export async function loadYouTubeMetadataByVideoID(
  videoID: string,
  deps?: YouTubeTranscriptDeps,
): Promise<{ title?: string }> {
  const normalizedVideoID = videoID.trim()
  if (!normalizedVideoID) return {}
  const canonicalURL = toCanonicalYouTubeURL(normalizedVideoID)

  try {
    const client = getSupadataClient(deps)
    const metadata = await client.metadata({ url: canonicalURL })
    const title = normalizeLine(typeof metadata.title === "string" ? metadata.title : "")
    return title ? { title } : {}
  } catch (error) {
    Log.Default.warn("Unable to fetch YouTube metadata from Supadata", {
      videoID: normalizedVideoID,
      canonicalURL,
      error,
    })
    return {}
  }
}
