export namespace Permission {
  export type Request = {
    permission: string
    patterns?: string[]
    always?: string[]
    metadata?: Record<string, unknown>
  }

  export async function ask(_input: Request) {
    return
  }
}
