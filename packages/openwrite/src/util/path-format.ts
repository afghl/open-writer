import path from "node:path"

export function toPosixPath(input: string) {
  return input.replace(/\\/g, "/")
}

export function trimLeadingSeparators(input: string) {
  return input.replace(/^[/\\]+/, "")
}

export function trimPosixSlashes(input: string) {
  return toPosixPath(input).replace(/^\/+/, "").replace(/\/+$/, "")
}

export function isWithinPath(base: string, target: string) {
  const relative = path.relative(base, target)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

