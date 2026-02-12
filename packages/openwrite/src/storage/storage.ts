import fs from "node:fs/promises"
import path from "node:path"

const BASE_DIR = process.env.OW_DATA_DIR ?? path.join(process.cwd(), ".openwrite")

function toFilePath(segments: string[]) {
  return path.join(BASE_DIR, ...segments) + ".json"
}

function toDirPath(segments: string[]) {
  return path.join(BASE_DIR, ...segments)
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

export namespace Storage {
  export async function write(segments: string[], data: unknown) {
    const filePath = toFilePath(segments)
    await ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8")
  }

  export async function read<T>(segments: string[]): Promise<T> {
    const filePath = toFilePath(segments)
    const content = await fs.readFile(filePath, "utf8")
    return JSON.parse(content) as T
  }

  export async function update<T>(segments: string[], editor: (draft: T) => void): Promise<T> {
    const current = await read<T>(segments)
    editor(current)
    await write(segments, current)
    return current
  }

  export async function remove(segments: string[]) {
    const filePath = toFilePath(segments)
    await fs.rm(filePath, { force: true })
  }

  export async function list(segments: string[]) {
    const dirPath = toDirPath(segments)
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => [])
    const result: string[][] = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue
      const name = entry.name.replace(/\.json$/, "")
      result.push([...segments, name])
    }
    return result
  }
}
