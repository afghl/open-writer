import fs from "fs/promises"
import path from "path"
import os from "os"

const app = "openwrite"
const home = process.env.OW_HOME || os.homedir()
const data = path.join(home, `.${app}`)
export const rootHolder = "/current_workspace/workspace"
const DEFAULT_DEV_NAMESPACE = path.resolve(process.cwd(), ".openwrite", "namespace")

function isProduction() {
  return process.env.NODE_ENV === "production"
}

export function getOpenwriteNamespace() {
  const configured = process.env.OW_NAMESPACE?.trim() ?? ""
  const openwriteNamespace = configured || (!isProduction() ? DEFAULT_DEV_NAMESPACE : "")
  if (!openwriteNamespace) {
    throw new Error("OW_NAMESPACE is required")
  }
  if (!path.isAbsolute(openwriteNamespace)) {
    throw new Error(`OW_NAMESPACE must be an absolute path: ${openwriteNamespace}`)
  }
  return openwriteNamespace
}

export const Path = {
  home,
  data,
  log: process.env.OW_LOG_DIR || path.join(data, "log"),
}

export const Global = {
  Path,
}

await fs.mkdir(Global.Path.log, { recursive: true })
