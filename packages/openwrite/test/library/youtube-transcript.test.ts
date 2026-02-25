import { expect, test } from "bun:test"
import { LibraryServiceError } from "../../src/library/types"
import {
  loadYouTubeMetadataByVideoID,
  loadYouTubeTranscriptTextByVideoID,
} from "../../src/library/youtube-transcript"

type TranscriptDeps = NonNullable<Parameters<typeof loadYouTubeTranscriptTextByVideoID>[1]>
type SupadataClient = NonNullable<TranscriptDeps["client"]>

function createMockClient(input: {
  transcript?: () => Promise<unknown>
  getJobStatus?: (jobID: string) => Promise<unknown>
  metadata?: () => Promise<unknown>
}): SupadataClient {
  const transcript = Object.assign(
    input.transcript ?? (async () => ({ content: "" })),
    {
      getJobStatus: input.getJobStatus ?? (async () => ({ status: "completed", result: null })),
    },
  )
  return {
    transcript,
    metadata: input.metadata ?? (async () => ({ title: null })),
  } as unknown as SupadataClient
}

test("loadYouTubeTranscriptTextByVideoID throws config error when api key is missing", async () => {
  await expect(loadYouTubeTranscriptTextByVideoID("dQw4w9WgXcQ", { apiKey: "" })).rejects.toMatchObject({
    code: "YOUTUBE_TRANSCRIPT_CONFIG_ERROR",
  } satisfies Partial<LibraryServiceError>)
})

test("loadYouTubeTranscriptTextByVideoID reads text from direct content string", async () => {
  const client = createMockClient({
    transcript: async () => ({
      lang: "en",
      availableLangs: ["en"],
      content: "line 1\r\nline 2\rline 3\n",
    }),
  })
  const text = await loadYouTubeTranscriptTextByVideoID("dQw4w9WgXcQ", { client })
  expect(text).toBe("line 1\nline 2\nline 3")
})

test("loadYouTubeTranscriptTextByVideoID joins chunk transcript content", async () => {
  const client = createMockClient({
    transcript: async () => ({
      lang: "en",
      availableLangs: ["en"],
      content: [
        { text: " first chunk ", offset: 0, duration: 1, lang: "en" },
        { text: "", offset: 1, duration: 1, lang: "en" },
        { text: "second chunk", offset: 2, duration: 1, lang: "en" },
      ],
    }),
  })
  const text = await loadYouTubeTranscriptTextByVideoID("dQw4w9WgXcQ", { client })
  expect(text).toBe("first chunk\nsecond chunk")
})

test("loadYouTubeTranscriptTextByVideoID resolves transcript by job id", async () => {
  let getJobStatusCalls = 0
  const client = createMockClient({
    transcript: async () => ({ jobId: "job_1" }),
    getJobStatus: async () => {
      getJobStatusCalls += 1
      if (getJobStatusCalls === 1) {
        return { status: "queued", result: null }
      }
      return {
        status: "completed",
        result: {
          lang: "en",
          availableLangs: ["en"],
          content: "resolved job transcript",
        },
      }
    },
  })
  const text = await loadYouTubeTranscriptTextByVideoID("dQw4w9WgXcQ", {
    client,
    pollIntervalMs: 0,
    sleep: async () => {},
  })
  expect(text).toBe("resolved job transcript")
})

test("loadYouTubeTranscriptTextByVideoID throws when transcript job fails", async () => {
  const client = createMockClient({
    transcript: async () => ({ jobId: "job_2" }),
    getJobStatus: async () => ({ status: "failed", error: { message: "failed" } }),
  })
  await expect(loadYouTubeTranscriptTextByVideoID("dQw4w9WgXcQ", {
    client,
    pollIntervalMs: 0,
    sleep: async () => {},
  })).rejects.toMatchObject({
    code: "YOUTUBE_TRANSCRIPT_UNAVAILABLE",
  } satisfies Partial<LibraryServiceError>)
})

test("loadYouTubeTranscriptTextByVideoID throws when transcript job times out", async () => {
  let nowTick = 0
  const client = createMockClient({
    transcript: async () => ({ jobId: "job_timeout" }),
    getJobStatus: async () => ({ status: "queued", result: null }),
  })

  await expect(loadYouTubeTranscriptTextByVideoID("dQw4w9WgXcQ", {
    client,
    pollIntervalMs: 0,
    timeoutMs: 120_000,
    sleep: async () => {},
    now: () => {
      nowTick += 80_000
      return nowTick
    },
  })).rejects.toMatchObject({
    code: "YOUTUBE_TRANSCRIPT_UNAVAILABLE",
  } satisfies Partial<LibraryServiceError>)
})

test("loadYouTubeMetadataByVideoID returns normalized title", async () => {
  const client = createMockClient({
    metadata: async () => ({ title: "  Example \n video title " }),
  })
  const metadata = await loadYouTubeMetadataByVideoID("dQw4w9WgXcQ", { client })
  expect(metadata).toEqual({ title: "Example video title" })
})

test("loadYouTubeMetadataByVideoID returns empty result on metadata failure", async () => {
  const client = createMockClient({
    metadata: async () => {
      throw new Error("metadata failed")
    },
  })
  const metadata = await loadYouTubeMetadataByVideoID("dQw4w9WgXcQ", { client })
  expect(metadata).toEqual({})
})
