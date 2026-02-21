import type { Hono } from "hono"
import { resolveProxyToken } from "../env"
import { runRequestContextAsync } from "@/context"
import { PROJECT_ID_HEADER, PROXY_TOKEN_HEADER } from "../constants"

export function registerGlobalRoutes(app: Hono) {
  app.get("/healthz", (c) => c.json({ status: "ok" }))

  app.use("*", async (c, next) => {
    if (c.req.path === "/healthz") {
      return next()
    }
    const expectedToken = resolveProxyToken()
    const incomingToken = c.req.header(PROXY_TOKEN_HEADER)?.trim() ?? ""
    if (!incomingToken || incomingToken !== expectedToken) {
      return c.json({ error: "Unauthorized proxy request" }, 401)
    }
    return next()
  })

  app.use("*", async (c, next) => {
    if (
      c.req.path === "/healthz"
      || (c.req.method === "POST" && c.req.path === "/api/project")
      || (c.req.method === "GET" && c.req.path === "/api/projects")
    ) {
      return next()
    }
    const projectId = c.req.header(PROJECT_ID_HEADER) ?? ""
    if (!projectId) {
      throw new Error("Project ID is required")
    }
    return runRequestContextAsync({ project_id: projectId }, () => next())
  })
}
