import { setupRoutes, serverConfig } from "./route"
import { resolveLogLevelEnv, validateServerEnv } from "./env"
import { Log } from "@/util/log"
import { Hono } from "hono"

async function main() {
    const isDev = process.env.NODE_ENV !== "production"
    const levelResult = Log.Level.safeParse(resolveLogLevelEnv())
    await Log.init({
        print: isDev,
        dev: isDev,
        level: levelResult.success ? levelResult.data : undefined,
    })

    validateServerEnv()

    const app = new Hono()
    setupRoutes(app)
    const log = Log.create({ service: "server" })
    const envPort = process.env.PORT ? Number(process.env.PORT) : undefined
    const port = Number.isFinite(envPort) ? envPort : serverConfig.port ?? 3000
    const server = Bun.serve({ port, fetch: app.fetch })

    log.info("Started server.", {
        url: `${server.protocol}://${server.hostname}:${server.port}`,
    })

    const shutdown = (signal: string) => {
        log.info("Shutting down server", { signal })
        server.stop()
    }

    process.on("SIGINT", () => shutdown("SIGINT"))
    process.on("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
