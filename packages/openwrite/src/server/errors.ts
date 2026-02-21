import type { Context } from "hono"
import { FsServiceError } from "@/fs"
import { LibraryServiceError } from "@/library"

export function isNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const value = error as { code?: unknown }
  return value.code === "ENOENT"
}

export function fsErrorResponse(c: Context, error: unknown) {
  if (!(error instanceof FsServiceError)) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return c.json({ error: message }, 500)
  }
  switch (error.code) {
    case "INVALID_PATH":
      return c.json({ error: error.message, code: error.code }, 400)
    case "NOT_FOUND":
      return c.json({ error: error.message, code: error.code }, 404)
    case "NOT_FILE":
    case "NOT_DIR":
      return c.json({ error: error.message, code: error.code }, 422)
    default:
      return c.json({ error: error.message, code: error.code }, 500)
  }
}

export function libraryErrorResponse(c: Context, error: unknown) {
  if (isNotFoundError(error)) {
    return c.json({ error: "Resource not found" }, 404)
  }
  if (!(error instanceof LibraryServiceError)) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return c.json({ error: message }, 500)
  }

  switch (error.code) {
    case "INVALID_IMPORT_INPUT":
    case "INVALID_URL":
    case "INVALID_YOUTUBE_URL":
    case "UNSUPPORTED_URL":
    case "UNSUPPORTED_FILE_TYPE":
      return c.json({ error: error.message, code: error.code }, 400)
    case "FILE_TOO_LARGE":
      return c.json({ error: error.message, code: error.code }, 413)
    case "REPLACE_DOC_NOT_FOUND":
    case "YOUTUBE_TRANSCRIPT_UNAVAILABLE":
      return c.json({ error: error.message, code: error.code }, 404)
    default:
      return c.json({ error: error.message, code: error.code }, 500)
  }
}
