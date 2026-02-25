import { z } from "zod"

export const LibraryImportMode = z.enum(["file", "url"])
export type LibraryImportMode = z.infer<typeof LibraryImportMode>

export const LibrarySourceType = z.enum(["file", "youtube"])
export type LibrarySourceType = z.infer<typeof LibrarySourceType>

export const LibraryFileExt = z.enum(["pdf", "txt", "md"])
export type LibraryFileExt = z.infer<typeof LibraryFileExt>

export const LibraryDocStatus = z.enum(["ready", "error"])
export type LibraryDocStatus = z.infer<typeof LibraryDocStatus>

export const LibraryImportStatus = z.enum(["queued", "processing", "success", "fail"])
export type LibraryImportStatus = z.infer<typeof LibraryImportStatus>

export const LibraryImportStage = z.enum([
  "queued",
  "validating",
  "ingesting",
  "parsing",
  "summarizing_title",
  "chunking",
  "embedding",
  "pinecone_upsert",
  "writing_summary",
  "refresh_index",
  "success",
  "fail",
])
export type LibraryImportStage = z.infer<typeof LibraryImportStage>

export const LibraryImportError = z.object({
  code: z.string(),
  message: z.string(),
})
export type LibraryImportError = z.infer<typeof LibraryImportError>

export const LibraryDocInfo = z.object({
  id: z.string(),
  project_id: z.string(),
  title: z.string(),
  title_slug: z.string(),
  source_type: LibrarySourceType,
  source_url: z.string().optional(),
  file_ext: LibraryFileExt,
  doc_path: z.string(),
  source_text_path: z.string().optional(),
  summary_path: z.string(),
  vector_ids: z.array(z.string()),
  chunk_count: z.number().int().nonnegative(),
  status: LibraryDocStatus,
  created_at: z.number(),
  updated_at: z.number(),
})
export type LibraryDocInfo = z.infer<typeof LibraryDocInfo>

export const LibraryImportInput = z.object({
  mode: LibraryImportMode,
  replace_doc_id: z.string().optional(),
  file_name: z.string().optional(),
  file_ext: LibraryFileExt.optional(),
  file_mime: z.string().optional(),
  file_size: z.number().int().nonnegative().optional(),
  payload_path: z.string().optional(),
  url: z.string().optional(),
})
export type LibraryImportInput = z.infer<typeof LibraryImportInput>

export const LibraryImportResult = z.object({
  doc_id: z.string(),
  doc_path: z.string(),
  summary_path: z.string(),
})
export type LibraryImportResult = z.infer<typeof LibraryImportResult>

export const LibraryImportInfo = z.object({
  id: z.string(),
  project_id: z.string(),
  input: LibraryImportInput,
  status: LibraryImportStatus,
  stage: LibraryImportStage,
  error: LibraryImportError.optional(),
  result: LibraryImportResult.optional(),
  time: z.object({
    created: z.number(),
    started: z.number().optional(),
    finished: z.number().optional(),
  }),
})
export type LibraryImportInfo = z.infer<typeof LibraryImportInfo>

export class LibraryServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "LibraryServiceError"
  }
}

export type ChunkRecord = {
  id: string
  text: string
  index: number
  offset_start: number
  text_len: number
  snippet: string
}

export type EmbeddingRecord = {
  id: string
  values: number[]
}

export type SummaryRecord = {
  title: string
  tldr: string
  keyPoints: string[]
  evidencePoints: string[]
}
