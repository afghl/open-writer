import fs from "fs/promises"
import path from "path"
import os from "os"

const app = "openwrite"
const home = process.env.OPENWRITE_HOME || os.homedir()
const data = path.join(home, `.${app}`)

export namespace Global {
    export const Path = {
        home,
        data,
        log: process.env.OPENWRITE_LOG_DIR || path.join(data, "log"),
    }
}

await fs.mkdir(Global.Path.log, { recursive: true })
