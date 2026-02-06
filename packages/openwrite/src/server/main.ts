import { app, serverConfig } from "./route"

const port = serverConfig.port ?? 3000
const server = Bun.serve({ port, fetch: app.fetch })

console.log(`Started server: ${server.protocol}://${server.hostname}:${server.port}`)
