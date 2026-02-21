import { createHash } from "node:crypto"
import type { RecordSparseValues } from "@pinecone-database/pinecone"
import { tokenize } from "./tokenizer"

const SPARSE_BUCKETS = 1_000_003

function bucketForToken(token: string) {
  const digest = createHash("sha1").update(token).digest()
  let value = 0
  for (let i = 0; i < 4; i += 1) {
    value = (value << 8) + (digest[i] ?? 0)
  }
  return Math.abs(value) % SPARSE_BUCKETS
}

export function sparseVectorFromText(text: string): RecordSparseValues {
  const tokens = tokenize(text)
  const freqByIndex = new Map<number, number>()

  for (const token of tokens) {
    const index = bucketForToken(token)
    freqByIndex.set(index, (freqByIndex.get(index) ?? 0) + 1)
  }

  const sorted = Array.from(freqByIndex.entries()).sort((a, b) => a[0] - b[0])

  return {
    indices: sorted.map(([index]) => index),
    values: sorted.map(([, count]) => 1 + Math.log(count)),
  }
}
