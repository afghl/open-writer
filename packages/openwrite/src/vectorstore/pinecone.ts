import { Pinecone } from "@pinecone-database/pinecone"
import type { RecordSparseValues } from "@pinecone-database/pinecone"

export type PineconeVector = {
  id: string
  values: number[]
  sparseValues?: RecordSparseValues
  metadata: Record<string, string | number | boolean>
}

export type PineconeQueryMatch = {
  id: string
  score: number
  metadata: Record<string, string | number | boolean>
}

export type PineconeFetchedRecord = {
  id: string
  metadata: Record<string, string | number | boolean>
}

const PINECONE_MAX_REQUEST_BYTES = 2 * 1024 * 1024
const PINECONE_UPSERT_SAFE_BYTES = Math.floor(PINECONE_MAX_REQUEST_BYTES * 0.9)
const UPSERT_WRAPPER_PREFIX_BYTES = Buffer.byteLength('{"records":[', "utf8")
const UPSERT_WRAPPER_SUFFIX_BYTES = Buffer.byteLength("]}", "utf8")

function byteLengthUTF8(input: string) {
  return Buffer.byteLength(input, "utf8")
}

function batchUpsertVectors(vectors: PineconeVector[]) {
  type VectorEntry = {
    vector: PineconeVector
    bytes: number
  }

  const entries: VectorEntry[] = vectors.map((vector) => ({
    vector,
    bytes: byteLengthUTF8(JSON.stringify(vector)),
  }))

  const result: PineconeVector[][] = []
  let currentBatch: PineconeVector[] = []
  let currentBytes = UPSERT_WRAPPER_PREFIX_BYTES + UPSERT_WRAPPER_SUFFIX_BYTES

  for (const entry of entries) {
    const singleRecordBytes = UPSERT_WRAPPER_PREFIX_BYTES + UPSERT_WRAPPER_SUFFIX_BYTES + entry.bytes
    if (singleRecordBytes > PINECONE_UPSERT_SAFE_BYTES) {
      throw new Error(
        `Pinecone upsert record "${entry.vector.id}" exceeds safe request size (${singleRecordBytes} bytes)`,
      )
    }

    const delimiterBytes = currentBatch.length > 0 ? 1 : 0
    const nextBytes = currentBytes + delimiterBytes + entry.bytes
    if (nextBytes > PINECONE_UPSERT_SAFE_BYTES) {
      if (currentBatch.length > 0) {
        result.push(currentBatch)
      }
      currentBatch = [entry.vector]
      currentBytes = UPSERT_WRAPPER_PREFIX_BYTES + UPSERT_WRAPPER_SUFFIX_BYTES + entry.bytes
      continue
    }

    currentBatch.push(entry.vector)
    currentBytes = nextBytes
  }

  if (currentBatch.length > 0) {
    result.push(currentBatch)
  }
  return result
}

export class PineconeService {
  private readonly enabledInternal: boolean
  private readonly indexName: string
  private readonly client?: Pinecone

  constructor() {
    const apiKey = process.env.PINECONE_API_KEY?.trim() ?? ""
    const indexName = process.env.OW_PINECONE_INDEX?.trim() ?? ""
    this.enabledInternal = apiKey.length > 0 && indexName.length > 0
    this.indexName = indexName
    if (this.enabledInternal) {
      this.client = new Pinecone({ apiKey })
    }
  }

  get enabled() {
    return this.enabledInternal
  }

  async upsert(projectID: string, vectors: PineconeVector[]) {
    if (!this.enabledInternal || vectors.length === 0 || !this.client) {
      return
    }
    const namespace = this.client.index(this.indexName).namespace(projectID)
    const batches = batchUpsertVectors(vectors)
    for (const records of batches) {
      await namespace.upsert({ records })
    }
  }

  async delete(projectID: string, vectorIDs: string[]) {
    if (!this.enabledInternal || vectorIDs.length === 0 || !this.client) {
      return
    }
    const namespace = this.client.index(this.indexName).namespace(projectID)
    await namespace.deleteMany({
      ids: vectorIDs,
    })
  }

  async query(input: {
    projectID: string
    values: number[]
    sparseValues?: RecordSparseValues
    topK: number
    filter?: object
  }): Promise<PineconeQueryMatch[]> {
    if (!this.enabledInternal || !this.client) {
      return []
    }
    const namespace = this.client.index(this.indexName).namespace(input.projectID)
    const result = await namespace.query({
      vector: input.values,
      ...(input.sparseValues ? { sparseVector: input.sparseValues } : {}),
      topK: input.topK,
      includeMetadata: true,
      includeValues: false,
      ...(input.filter ? { filter: input.filter } : {}),
    })

    return (result.matches ?? []).map((match) => ({
      id: match.id,
      score: match.score ?? 0,
      metadata: (match.metadata ?? {}) as Record<string, string | number | boolean>,
    }))
  }

  async fetch(projectID: string, vectorIDs: string[]): Promise<PineconeFetchedRecord[]> {
    if (!this.enabledInternal || !this.client || vectorIDs.length === 0) {
      return []
    }
    const namespace = this.client.index(this.indexName).namespace(projectID)
    const result = await namespace.fetch({ ids: vectorIDs })
    const records = (result.records ?? {}) as Record<string, { id?: string; metadata?: Record<string, string | number | boolean> }>
    return Object.entries(records).map(([id, record]) => ({
      id: record.id ?? id,
      metadata: record.metadata ?? {},
    }))
  }
}
