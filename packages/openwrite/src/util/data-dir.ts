import path from "node:path"

export function openwriteDataDir() {
  return process.env.OW_DATA_DIR ?? path.join(process.cwd(), ".openwrite")
}

