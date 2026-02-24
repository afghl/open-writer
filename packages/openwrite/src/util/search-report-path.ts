import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import { pinyin } from "pinyin-pro"
import { resolveWorkspacePath } from "./workspace-path"

const REPORTS_DIR = "spec/research/search-reports"
const MIN_SLUG_LEN = 3
const MAX_SLUG_LEN = 64

function shortHash(input: string) {
  return createHash("sha1").update(input).digest("hex").slice(0, 8)
}

function normalizeQuerySeed(query: string) {
  return query
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
}

function toPhoneticSeed(query: string) {
  if (!query) return query
  try {
    return pinyin(query, {
      toneType: "none",
      nonZh: "consecutive",
      v: "u",
      type: "string",
    })
  } catch {
    return query
  }
}

function slugifyQueryForReportName(query: string) {
  return query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_SLUG_LEN)
}

function buildBaseReportFileStem(query: string) {
  const seed = normalizeQuerySeed(query)
  const phoneticSeed = toPhoneticSeed(seed)
  const slug = slugifyQueryForReportName(phoneticSeed)
  if (slug.length >= MIN_SLUG_LEN) {
    return slug
  }
  return `q-${shortHash(seed || "empty-query")}`
}

async function pathExists(absolutePath: string) {
  try {
    await fs.access(absolutePath)
    return true
  } catch {
    return false
  }
}

export function searchReportPathPlaceholder() {
  return `${REPORTS_DIR}/runtime-generated.md`
}

export async function resolveUniqueSearchReportPath(input: {
  projectID: string
  query: string
}) {
  const stem = buildBaseReportFileStem(input.query)
  let index = 1

  while (true) {
    const fileName = index === 1 ? `${stem}.md` : `${stem}-${index}.md`
    const logicalPath = `${REPORTS_DIR}/${fileName}`
    const { resolvedPath } = resolveWorkspacePath(logicalPath, input.projectID)
    const exists = await pathExists(resolvedPath)
    if (!exists) {
      return logicalPath
    }
    index += 1
  }
}
