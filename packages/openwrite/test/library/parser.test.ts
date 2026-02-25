import { expect, test } from "bun:test"
import { LibraryServiceError } from "../../src/library/types"
import { ensureAllowedFileExt, inferFileExt, parseFileBuffer } from "../../src/library/parser"

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
