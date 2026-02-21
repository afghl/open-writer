import type { Hono } from "hono"
import { annotateTreePreviewFromDocs, listTree, readFile, readFileRaw } from "@/fs"
import { ctx } from "@/context"
import { LibraryImportService } from "@/library"
import { fsRawInput, fsReadInput, fsTreeInput } from "../schemas"
import { fsErrorResponse } from "../errors"

function sanitizeDispositionFilename(input: string) {
  const value = input.replace(/[\r\n]/g, "_").replace(/\\/g, "_").replace(/\"/g, "'").trim()
  return value.length > 0 ? value : "file"
}

export function registerFsRoutes(app: Hono) {
  app.get("/api/fs/tree", async (c) => {
    const parsed = fsTreeInput.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }
    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }
    try {
      const result = await listTree({
        projectID,
        path: parsed.data.path,
        depth: parsed.data.depth,
      })
      const docs = await LibraryImportService.listDocs(projectID)
      return c.json({
        root: annotateTreePreviewFromDocs(result.root, docs),
      })
    } catch (error) {
      return fsErrorResponse(c, error)
    }
  })

  app.get("/api/fs/read", async (c) => {
    const parsed = fsReadInput.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }
    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }
    try {
      const result = await readFile({
        projectID,
        path: parsed.data.path,
        offset: parsed.data.offset,
        limit: parsed.data.limit,
      })
      return c.json(result)
    } catch (error) {
      return fsErrorResponse(c, error)
    }
  })

  app.get("/api/fs/raw", async (c) => {
    const parsed = fsRawInput.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.issues }, 400)
    }
    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }
    try {
      const result = await readFileRaw({
        projectID,
        path: parsed.data.path,
      })
      c.header("content-type", result.contentType)
      c.header("content-disposition", `inline; filename="${sanitizeDispositionFilename(result.fileName)}"`)
      c.header("cache-control", "no-store")
      return c.body(result.bytes)
    } catch (error) {
      return fsErrorResponse(c, error)
    }
  })
}
