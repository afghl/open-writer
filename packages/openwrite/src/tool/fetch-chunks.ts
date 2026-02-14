import z from "zod"
import { Tool } from "./tool"
import { fetchChunks } from "@/search/cache"

const DESCRIPTION =
  "Fetch full chunk text and metadata by chunk IDs for evidence verification."

export const FetchChunksTool = Tool.define("fetch_chunks", async () => ({
  description: DESCRIPTION,
  parameters: z.object({
    chunk_ids: z.array(z.string().min(1)).min(1).max(100)
      .describe("Chunk IDs to fetch in order."),
  }),
  async execute(params, ctx) {
    await ctx.ask({
      permission: "read",
      patterns: ["inputs/library/**"],
      always: ["*"],
      metadata: {
        tool: "fetch_chunks",
        chunkCount: params.chunk_ids.length,
      },
    })

    const result = await fetchChunks({
      projectID: ctx.projectID,
      chunkIDs: params.chunk_ids,
    })

    return {
      title: `fetch_chunks (${result.chunks.length})`,
      metadata: {
        requested: params.chunk_ids.length,
        returned: result.chunks.length,
        missing: result.missing_chunk_ids.length,
      },
      output: JSON.stringify(result, null, 2),
    }
  },
}))
