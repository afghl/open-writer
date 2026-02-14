import { z } from "zod"

let counter = 0

export function ascending(prefix: string) {
  counter += 1
  return `${prefix}_${Date.now()}_${counter}`
}

export function schema(_prefix: string) {
  return z.string()
}

export const Identifier = {
  ascending,
  schema,
}
