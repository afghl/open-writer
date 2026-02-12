import { promises as fs } from "node:fs"
import path from "node:path"
import { resolveWorkspacePath } from "@/path/workspace"
import type { FsNode, FsReadResult } from "./types"
import { FsServiceError } from "./types"

const DEFAULT_TREE_DEPTH = 3
const MAX_TREE_DEPTH = 8
const DEFAULT_READ_LIMIT = 2000
const MAX_READ_LIMIT = 5000
const MAX_READ_BYTES = 200 * 1024

function normalizeDepth(value: number | undefined) {
  const depth = value ?? DEFAULT_TREE_DEPTH
  return Math.max(0, Math.min(MAX_TREE_DEPTH, depth))
}

function normalizeLimit(value: number | undefined) {
  const limit = value ?? DEFAULT_READ_LIMIT
  return Math.max(1, Math.min(MAX_READ_LIMIT, limit))
}

function truncateByBytes(input: string, maxBytes: number) {
  const raw = Buffer.from(input, "utf8")
  if (raw.byteLength <= maxBytes) {
    return { output: input, truncated: false }
  }
  return {
    output: raw.subarray(0, maxBytes).toString("utf8"),
    truncated: true,
  }
}

function toServiceError(error: unknown, inputPath: string) {
  if (error instanceof FsServiceError) return error
  if (error && typeof error === "object") {
    const data = error as { code?: string; message?: string }
    if (data.code === "ENOENT") {
      return new FsServiceError("NOT_FOUND", `Path not found: ${inputPath}`)
    }
  }
  if (error instanceof Error && error.message.includes("Path escapes project workspace")) {
    return new FsServiceError("INVALID_PATH", error.message)
  }
  if (error instanceof Error) {
    return new FsServiceError("INVALID_PATH", error.message)
  }
  return new FsServiceError("INVALID_PATH", `Invalid path: ${inputPath}`)
}

function sortNodes(nodes: FsNode[]) {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

async function buildNode(logicalPath: string, projectID: string, depth: number): Promise<FsNode> {
  const { resolvedPath, logicalNamespacePath } = resolveWorkspacePath(logicalPath, projectID)
  const stat = await fs.stat(resolvedPath)
  const node: FsNode = {
    name: path.basename(resolvedPath) || "workspace",
    path: logicalNamespacePath,
    kind: stat.isDirectory() ? "dir" : "file",
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  }

  if (node.kind === "dir" && depth > 0) {
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true })
    const children = await Promise.all(
      entries.map((entry) => {
        const childPath = `${logicalNamespacePath}/${entry.name}`
        return buildNode(childPath, projectID, depth - 1)
      }),
    )
    node.children = sortNodes(children)
  }
  return node
}

export async function listTree(input: {
  projectID: string
  path?: string
  depth?: number
}): Promise<{ root: FsNode }> {
  const targetPath = input.path?.trim() || `projects/${input.projectID}/workspace`
  try {
    const root = await buildNode(targetPath, input.projectID, normalizeDepth(input.depth))
    if (root.kind !== "dir") {
      throw new FsServiceError("NOT_DIR", `Path is not a directory: ${targetPath}`)
    }
    return { root }
  } catch (error) {
    throw toServiceError(error, targetPath)
  }
}

export async function readFile(input: {
  projectID: string
  path: string
  offset?: number
  limit?: number
}): Promise<FsReadResult> {
  const offset = Math.max(0, input.offset ?? 0)
  const limit = normalizeLimit(input.limit)
  try {
    const { resolvedPath, logicalNamespacePath } = resolveWorkspacePath(input.path, input.projectID)
    const stat = await fs.stat(resolvedPath)
    if (!stat.isFile()) {
      throw new FsServiceError("NOT_FILE", `Path is not a file: ${input.path}`)
    }
    const raw = await fs.readFile(resolvedPath, "utf8")
    const lines = raw.split(/\r?\n/)
    const end = Math.min(lines.length, offset + limit)
    const contentResult = truncateByBytes(lines.slice(offset, end).join("\n"), MAX_READ_BYTES)
    return {
      path: logicalNamespacePath,
      content: contentResult.output,
      totalLines: lines.length,
      truncated: contentResult.truncated || end < lines.length,
      offset,
      limit,
    }
  } catch (error) {
    throw toServiceError(error, input.path)
  }
}
