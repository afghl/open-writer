const DEFAULT_DEV_OPENWRITE_API_BASE = "http://127.0.0.1:3000"
const DEFAULT_DEV_PROXY_TOKEN = "dev-openwrite-proxy-token"
const DEFAULT_PROXY_TIMEOUT_MS = 15_000
const PROXY_TOKEN_HEADER = "x-ow-proxy-token"

class ProxyConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProxyConfigError"
  }
}

class ProxyTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProxyTimeoutError"
  }
}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

function isProduction() {
  return process.env.NODE_ENV === "production"
}

function readEnv(name: string) {
  const raw = process.env[name]
  if (!raw) return ""
  return raw.trim()
}

function proxyTimeoutMs() {
  const raw = readEnv("OW_PROXY_TIMEOUT_MS")
  if (!raw) return DEFAULT_PROXY_TIMEOUT_MS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROXY_TIMEOUT_MS
}

export function openwriteApiBase() {
  const configured = readEnv("OW_API_BASE")
  if (configured) {
    return trimTrailingSlash(configured)
  }
  if (isProduction()) {
    throw new ProxyConfigError("OW_API_BASE is required in production")
  }
  return DEFAULT_DEV_OPENWRITE_API_BASE
}

function openwriteProxyToken() {
  const configured = readEnv("OW_PROXY_TOKEN")
  if (configured) {
    return configured
  }
  if (isProduction()) {
    throw new ProxyConfigError("OW_PROXY_TOKEN is required in production")
  }
  return DEFAULT_DEV_PROXY_TOKEN
}

function assertProxyConfig() {
  openwriteApiBase()
  openwriteProxyToken()
}

if (isProduction()) {
  assertProxyConfig()
}

export function upstreamURL(pathname: string, query?: string) {
  const base = openwriteApiBase()
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`
  const suffix = query && query.length > 0 ? `?${query}` : ""
  return `${base}${normalizedPath}${suffix}`
}

export async function proxyFetch(input: {
  pathname: string
  query?: string
  method: string
  headers?: HeadersInit
  body?: BodyInit | null
}) {
  const timeoutMs = proxyTimeoutMs()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const headers = new Headers(input.headers)
  headers.set(PROXY_TOKEN_HEADER, openwriteProxyToken())

  try {
    return await fetch(upstreamURL(input.pathname, input.query), {
      method: input.method,
      headers,
      body: input.body,
      cache: "no-store",
      signal: controller.signal,
    })
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError")
      || (error instanceof Error && error.name === "AbortError")
    ) {
      throw new ProxyTimeoutError(`Openwrite backend request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
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
  if (error instanceof ProxyConfigError) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (error instanceof ProxyTimeoutError) {
    return Response.json({ error: error.message }, { status: 504 })
  }
  const message = error instanceof Error ? error.message : String(error)
  return Response.json(
    { error: `Failed to reach openwrite backend: ${message}` },
    { status: 502 },
  )
}
