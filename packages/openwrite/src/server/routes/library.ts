import type { Hono } from "hono"
import { LibraryImportRunner, LibraryImportService } from "@/library"
import { ctx } from "@/context"
import { libraryErrorResponse } from "../errors"

export function registerLibraryRoutes(app: Hono) {
  app.post("/api/library/import", async (c) => {
    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }

    let formData: FormData
    try {
      formData = await c.req.raw.formData()
    } catch {
      return c.json({ error: "Invalid multipart/form-data body" }, 400)
    }

    const fileValue = formData.get("file")
    const urlValue = formData.get("url")
    const replaceDocIDValue = formData.get("replace_doc_id")
    const replaceDocID = typeof replaceDocIDValue === "string" ? replaceDocIDValue.trim() : ""

    let fileInput:
      | {
        name: string
        type: string
        size: number
        bytes: Buffer
      }
      | undefined

    if (fileValue instanceof File && fileValue.size > 0) {
      const bytes = Buffer.from(await fileValue.arrayBuffer())
      fileInput = {
        name: fileValue.name,
        type: fileValue.type,
        size: fileValue.size,
        bytes,
      }
    } else if (fileValue !== null && fileValue !== undefined && !(typeof fileValue === "string")) {
      return c.json({ error: "Invalid file input" }, 400)
    }

    const url = typeof urlValue === "string" ? urlValue.trim() : ""

    try {
      const created = await LibraryImportService.createImport({
        projectID,
        ...(fileInput ? { file: fileInput } : {}),
        ...(url ? { url } : {}),
        ...(replaceDocID ? { replaceDocID } : {}),
      })
      LibraryImportRunner.kick()
      return c.json({
        import: {
          id: created.id,
          status: created.status,
          stage: created.stage,
        },
      }, 202)
    } catch (error) {
      return libraryErrorResponse(c, error)
    }
  })

  app.get("/api/library/import/:id", async (c) => {
    const importID = c.req.param("id")?.trim()
    if (!importID) {
      return c.json({ error: "Import ID is required" }, 400)
    }

    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }

    try {
      const item = await LibraryImportService.getImport(projectID, importID)
      const doc = item.result?.doc_id
        ? await LibraryImportService.getDoc(projectID, item.result.doc_id).catch(() => undefined)
        : undefined
      return c.json({
        import: item,
        ...(doc ? { doc } : {}),
      })
    } catch (error) {
      return libraryErrorResponse(c, error)
    }
  })

  app.get("/api/library/docs", async (c) => {
    const projectID = ctx()?.project_id ?? ""
    if (!projectID) {
      return c.json({ error: "Project ID is required" }, 400)
    }
    try {
      const docs = await LibraryImportService.listDocs(projectID)
      return c.json({ docs })
    } catch (error) {
      return libraryErrorResponse(c, error)
    }
  })
}
