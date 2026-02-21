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
    await namespace.upsert({
      records: vectors,
    })
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
