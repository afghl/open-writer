import fs from "fs/promises"
import path from "path"
import os from "os"

const app = "openwrite"
const home = process.env.OPENWRITE_HOME || os.homedir()
const data = path.join(home, `.${app}`)
export const rootHolder = "/current_workspace/workspace"
const openwriteNamespace = process.env.OPENWRITE_NAMESPACE ?? ""

export function getOpenwriteNamespace() {
  if (!openwriteNamespace) {
    throw new Error("OPENWRITE_NAMESPACE is required")
  }
  if (!path.isAbsolute(openwriteNamespace)) {
    throw new Error(`OPENWRITE_NAMESPACE must be an absolute path: ${openwriteNamespace}`)
  }
  return openwriteNamespace
}

export namespace Global {
  export const Path = {
    home,
    data,
    log: process.env.OPENWRITE_LOG_DIR || path.join(data, "log"),
  }

}

await fs.mkdir(Global.Path.log, { recursive: true })
