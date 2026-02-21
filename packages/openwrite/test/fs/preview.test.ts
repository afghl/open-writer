import { expect, test } from "bun:test"
import { annotateTreePreviewFromDocs } from "../../src/fs/preview"
import type { FsNode } from "../../src/fs/types"

function findNodeByPath(node: FsNode, targetPath: string): FsNode | null {
  if (node.path === targetPath) {
    return node
  }
  for (const child of node.children ?? []) {
    const found = findNodeByPath(child, targetPath)
    if (found) {
      return found
    }
  }
  return null
}

test("annotateTreePreviewFromDocs classifies text/youtube/pdf correctly", () => {
  const projectID = "project-preview-test"
  const root: FsNode = {
    name: "workspace",
    path: `projects/${projectID}/workspace`,
    kind: "dir",
    size: 0,
    mtimeMs: 0,
    children: [
      {
        name: "notes.txt",
        path: `projects/${projectID}/workspace/notes.txt`,
        kind: "file",
        size: 10,
        mtimeMs: 0,
      },
      {
        name: "paper.pdf",
        path: `projects/${projectID}/workspace/paper.pdf`,
        kind: "file",
        size: 20,
        mtimeMs: 0,
      },
      {
        name: "yt-doc.txt",
        path: `projects/${projectID}/workspace/inputs/library/docs/yt-doc.txt`,
        kind: "file",
        size: 30,
        mtimeMs: 0,
      },
    ],
  }

  const annotated = annotateTreePreviewFromDocs(root, [
    {
      doc_path: `projects/${projectID}/workspace/inputs/library/docs/yt-doc.txt`,
      source_type: "youtube",
      source_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
  ])

  const textNode = findNodeByPath(annotated, `projects/${projectID}/workspace/notes.txt`)
  const pdfNode = findNodeByPath(annotated, `projects/${projectID}/workspace/paper.pdf`)
  const youtubeNode = findNodeByPath(annotated, `projects/${projectID}/workspace/inputs/library/docs/yt-doc.txt`)

  expect(textNode?.preview?.kind).toBe("text")
  expect(pdfNode?.preview?.kind).toBe("pdf")
  expect(youtubeNode?.preview?.kind).toBe("youtube")
  expect(youtubeNode?.preview?.source_url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
})
