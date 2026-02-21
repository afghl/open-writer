export type FsNodeKind = "file" | "dir"
export type FsPreviewKind = "text" | "youtube" | "pdf"

export type FsNodePreview = {
  kind: FsPreviewKind
  source_type?: "file" | "youtube"
  source_url?: string
}

export type FsNode = {
  name: string
  path: string
  kind: FsNodeKind
  size: number
  mtimeMs: number
  preview?: FsNodePreview
  children?: FsNode[]
}

export type FsReadResult = {
  path: string
  content: string
  totalLines: number
  truncated: boolean
  offset: number
  limit: number
}

export type FsRawResult = {
  path: string
  contentType: string
  fileName: string
  bytes: Buffer
}

export class FsServiceError extends Error {
  constructor(
    public readonly code: "INVALID_PATH" | "NOT_FOUND" | "NOT_FILE" | "NOT_DIR",
    message: string,
  ) {
    super(message)
    this.name = "FsServiceError"
  }
}
