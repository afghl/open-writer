import { expect, test } from "bun:test"
import {
  ensureAllowedFileExt,
  inferFileExt,
  parseFileBuffer,
  parseYouTubeTranscript,
  parseYouTubeURL,
} from "../../src/library/parser"
import { LibraryServiceError } from "../../src/library/types"

test("inferFileExt and ensureAllowedFileExt accept markdown extension", () => {
  expect(inferFileExt("notes.md")).toBe("md")
  expect(ensureAllowedFileExt("notes.md")).toBe("md")
})

test("parseFileBuffer parses markdown as plain text", async () => {
  const result = await parseFileBuffer({
    ext: "md",
    buffer: Buffer.from("# Title\r\n\r\nbody", "utf8"),
  })
  expect(result.sourceType).toBe("file")
  expect(result.text).toBe("# Title\n\nbody")
})

test("parseFileBuffer rejects empty markdown content", async () => {
  await expect(parseFileBuffer({
    ext: "md",
    buffer: Buffer.from("   \n", "utf8"),
  })).rejects.toBeInstanceOf(LibraryServiceError)
})

test("parseYouTubeURL parses watch, shorts, and youtu.be URLs", () => {
  const watch = parseYouTubeURL("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  expect(watch.videoID).toBe("dQw4w9WgXcQ")
  expect(watch.canonicalURL).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

  const shorts = parseYouTubeURL("https://www.youtube.com/shorts/dQw4w9WgXcQ")
  expect(shorts.videoID).toBe("dQw4w9WgXcQ")
  expect(shorts.canonicalURL).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

  const shortURL = parseYouTubeURL("https://youtu.be/dQw4w9WgXcQ")
  expect(shortURL.videoID).toBe("dQw4w9WgXcQ")
  expect(shortURL.canonicalURL).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
})

test("parseYouTubeTranscript propagates transcript config errors", async () => {
  const prevSupadataKey = process.env.SUPADATA_API_KEY
  delete process.env.SUPADATA_API_KEY
  try {
    await expect(parseYouTubeTranscript("https://youtu.be/dQw4w9WgXcQ")).rejects.toMatchObject({
      code: "YOUTUBE_TRANSCRIPT_CONFIG_ERROR",
    })
  } finally {
    if (prevSupadataKey === undefined) {
      delete process.env.SUPADATA_API_KEY
    } else {
      process.env.SUPADATA_API_KEY = prevSupadataKey
    }
  }
})
