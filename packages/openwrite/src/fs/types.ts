export type FsNodeKind = "file" | "dir"

export type FsNode = {
  name: string
  path: string
  kind: FsNodeKind
  size: number
  mtimeMs: number
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

export class FsServiceError extends Error {
  constructor(
    public readonly code: "INVALID_PATH" | "NOT_FOUND" | "NOT_FILE" | "NOT_DIR",
    message: string,
  ) {
    super(message)
    this.name = "FsServiceError"
  }
}
