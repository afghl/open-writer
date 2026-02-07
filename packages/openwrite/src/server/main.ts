import { app, serverConfig } from "./route"
import { Log } from "@/util/log"

const isDev = process.env.NODE_ENV !== "production"
const levelResult = Log.Level.safeParse(process.env.LOG_LEVEL)
await Log.init({
    print: isDev,
    dev: isDev,
    level: levelResult.success ? levelResult.data : undefined,
})

const log = Log.create({ service: "server" })
const port = serverConfig.port ?? 3000
const server = Bun.serve({ port, fetch: app.fetch })

log.info("Started server", {
    url: `${server.protocol}://${server.hostname}:${server.port}`,
})
