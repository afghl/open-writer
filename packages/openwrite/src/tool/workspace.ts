import path from "node:path"
import { getOpenwriteNamespace, rootHolder } from "@/global"

const pathSep = path.sep

const trimLeadingSeparators = (input: string) => input.replace(/^[/\\]+/, "")

const ensureProjectID = (projectID: string) => {
  if (!projectID) {
    throw new Error("projectID is required for tool execution.")
  }
  if (projectID.includes("/") || projectID.includes("\\") || projectID.includes("..")) {
    throw new Error(`Invalid projectID: ${projectID}`)
  }
}

const isWithin = (base: string, target: string) => {
  const relative = path.relative(base, target)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

const normalizeToPosix = (input: string) => input.replace(/\\/g, "/")
const escapeRegex = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function replaceWorkspacePrefixWithBoundary(input: string, prefix: string, replacement: string) {
  const escaped = escapeRegex(prefix)
  const re = new RegExp(`(^|[\\s"'\\\`),;:&|])${escaped}(?=\\/|$|[\\s"'\\\`),;:&|])`, "g")
  return input.replace(re, (_match, leadingBoundary: string) => `${leadingBoundary}${replacement}`)
}

function modelPathToProjectRelative(inputPath: string, projectID: string) {
  const namespacePrefix = `projects/${projectID}/workspace`
  const normalized = normalizeToPosix(inputPath)
  const modelPrefix = normalizeToPosix(rootHolder)
  const withLeadingNamespace = `/${namespacePrefix}`

  if (normalized === modelPrefix || normalized === namespacePrefix || normalized === withLeadingNamespace) {
    return ""
  }
  if (normalized.startsWith(`${modelPrefix}/`)) {
    return normalized.slice(modelPrefix.length + 1)
  }
  if (normalized.startsWith(`${namespacePrefix}/`)) {
    return normalized.slice(namespacePrefix.length + 1)
  }
  if (normalized.startsWith(`${withLeadingNamespace}/`)) {
    return normalized.slice(withLeadingNamespace.length + 1)
  }
  return undefined
}

export function projectWorkspaceRoot(projectID: string) {
  ensureProjectID(projectID)
  const namespace = getOpenwriteNamespace()
  return path.join(namespace, "projects", projectID, "workspace")
}

export function resolveWorkspacePath(inputPath: string, projectID: string) {
  ensureProjectID(projectID)
  const workspaceRoot = projectWorkspaceRoot(projectID)
  const mappedRelative = modelPathToProjectRelative(inputPath, projectID)

  const candidate = (() => {
    if (mappedRelative !== undefined) {
      return mappedRelative
    }
    if (path.isAbsolute(inputPath)) {
      return inputPath
    }
    return trimLeadingSeparators(inputPath)
  })()

  const resolvedPath = path.normalize(
    path.isAbsolute(candidate) ? candidate : path.join(workspaceRoot, candidate),
  )
  if (!isWithin(workspaceRoot, resolvedPath)) {
    throw new Error(`Path escapes project workspace: ${inputPath}`)
  }

  const relativePath = path.relative(workspaceRoot, resolvedPath)
  const logicalNamespacePath = relativePath
    ? `projects/${projectID}/workspace/${normalizeToPosix(relativePath)}`
    : `projects/${projectID}/workspace`

  return {
    resolvedPath,
    workspaceRoot,
    logicalNamespacePath,
  }
}

export function resolveWorkspaceDir(inputDir: string | undefined, projectID: string) {
  const fallback = rootHolder
  return resolveWorkspacePath(inputDir ?? fallback, projectID)
}

export function rewriteCommandWorkspacePaths(command: string, projectID: string) {
  ensureProjectID(projectID)
  const workspaceRoot = projectWorkspaceRoot(projectID)
  const logicalRoot = `projects/${projectID}/workspace`
  const withAbsoluteLogicalRoot = replaceWorkspacePrefixWithBoundary(command, `/${logicalRoot}`, workspaceRoot)
  const withRelativeLogicalRoot = replaceWorkspacePrefixWithBoundary(withAbsoluteLogicalRoot, logicalRoot, workspaceRoot)
  return replaceWorkspacePrefixWithBoundary(withRelativeLogicalRoot, rootHolder, workspaceRoot)
}

export function logicalWorkspaceRoot(projectID: string) {
  ensureProjectID(projectID)
  return `projects/${projectID}/workspace`
}

export function normalizeShellPath(value: string) {
  if (!value) return value
  return value.split(pathSep).join("/")
}
