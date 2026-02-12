const DEFAULT_OPENWRITE_API_BASE = "http://127.0.0.1:3000"

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

export function openwriteApiBase() {
  const configured = process.env.OPENWRITE_API_BASE?.trim()
  return trimTrailingSlash(configured && configured.length > 0 ? configured : DEFAULT_OPENWRITE_API_BASE)
}

export function upstreamURL(pathname: string, query?: string) {
  const base = openwriteApiBase()
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`
  const suffix = query && query.length > 0 ? `?${query}` : ""
  return `${base}${normalizedPath}${suffix}`
}

export async function relayResponse(upstream: Response) {
  const body = await upstream.arrayBuffer()
  const contentType = upstream.headers.get("content-type") ?? "application/json; charset=utf-8"
  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": contentType,
    },
  })
}

export function proxyErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return Response.json(
    { error: `Failed to reach openwrite backend: ${message}` },
    { status: 502 },
  )
}
