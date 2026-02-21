import type { FsNode, FsNodePreview } from "./types"

type FsPreviewDocMeta = {
  sourceType: "file" | "youtube"
  sourceURL?: string
}

export type FsPreviewDocInput = {
  doc_path: string
  source_type: "file" | "youtube"
  source_url?: string
}

function normalizeWorkspacePathForPreview(input: string) {
  return input.replace(/^\/+/, "")
}

function buildDocMetaByPath(docs: FsPreviewDocInput[]) {
  const byPath = new Map<string, FsPreviewDocMeta>()
  for (const doc of docs) {
    byPath.set(normalizeWorkspacePathForPreview(doc.doc_path), {
      sourceType: doc.source_type,
      sourceURL: doc.source_url,
    })
  }
  return byPath
}

export function previewForFilePath(filePath: string, docsByPath: Map<string, FsPreviewDocMeta>): FsNodePreview {
  const normalized = normalizeWorkspacePathForPreview(filePath)
  const doc = docsByPath.get(normalized)
  if (doc?.sourceType === "youtube") {
    return {
      kind: "youtube",
      source_type: "youtube",
      ...(doc.sourceURL ? { source_url: doc.sourceURL } : {}),
    }
  }
  if (normalized.toLowerCase().endsWith(".pdf")) {
    return {
      kind: "pdf",
      ...(doc ? { source_type: doc.sourceType } : {}),
      ...(doc?.sourceURL ? { source_url: doc.sourceURL } : {}),
    }
  }
  return {
    kind: "text",
    ...(doc ? { source_type: doc.sourceType } : {}),
    ...(doc?.sourceURL ? { source_url: doc.sourceURL } : {}),
  }
}

function annotateTreePreview(node: FsNode, docsByPath: Map<string, FsPreviewDocMeta>): FsNode {
  if (node.kind === "dir") {
    return {
      ...node,
      children: node.children?.map((child) => annotateTreePreview(child, docsByPath)),
    }
  }
  return {
    ...node,
    preview: previewForFilePath(node.path, docsByPath),
  }
}

export function annotateTreePreviewFromDocs(root: FsNode, docs: FsPreviewDocInput[]) {
  return annotateTreePreview(root, buildDocMetaByPath(docs))
}
