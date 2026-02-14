import { expect, test } from "bun:test"
import { chunkText } from "../../src/library/etl"

test("chunkText produces stable chunk ids and overlap windows", () => {
  const text = Array.from({ length: 2_400 }, (_, index) => `w${index}`).join(" ")
  const chunks = chunkText({
    docID: "doc_abc12345",
    text,
    chunkSize: 800,
    overlap: 120,
  })

  expect(chunks.length).toBeGreaterThan(1)
  expect(chunks[0]?.id).toBe("doc_abc12345::0")
  expect(chunks[1]?.id).toBe("doc_abc12345::1")
  expect(chunks.every((item) => item.text.length > 0)).toBeTrue()
})
