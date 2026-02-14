export type PermissionRequest = {
  permission: string
  patterns?: string[]
  always?: string[]
  metadata?: Record<string, unknown>
}

export async function ask(_input: PermissionRequest) {
  return
}

export const Permission = {
  ask,
}
