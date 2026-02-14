import { Pinecone } from "@pinecone-database/pinecone"

export type PineconeVector = {
  id: string
  values: number[]
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
}
