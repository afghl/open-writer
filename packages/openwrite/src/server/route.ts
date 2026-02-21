import { Hono } from "hono"
import { registerEventRoutes } from "./routes/events"
import { registerFsRoutes } from "./routes/fs"
import { registerGlobalRoutes } from "./routes/global"
import { registerLibraryRoutes } from "./routes/library"
import { registerMessageRoutes } from "./routes/messages"
import { registerProjectRoutes } from "./routes/projects"
import { registerSearchRoutes } from "./routes/search"
import { registerTaskRoutes } from "./routes/tasks"

export const app = new Hono()

export function setupRoutes(app: Hono) {
  registerGlobalRoutes(app)
  registerEventRoutes(app)
  registerMessageRoutes(app)
  registerFsRoutes(app)
  registerLibraryRoutes(app)
  registerProjectRoutes(app)
  registerTaskRoutes(app)
  registerSearchRoutes(app)
}

export const serverConfig = {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
}
