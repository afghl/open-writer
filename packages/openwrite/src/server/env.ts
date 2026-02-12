import { getOpenwriteNamespace } from "@/global"

const DEFAULT_DEV_PROXY_TOKEN = "dev-openwrite-proxy-token"

function readEnv(name: string) {
  const raw = process.env[name]
  if (!raw) return ""
  return raw.trim()
}

export function isProduction() {
  return process.env.NODE_ENV === "production"
}

export function resolveProxyToken() {
  const token = readEnv("OW_PROXY_TOKEN")
  if (token) {
    return token
  }
  if (isProduction()) {
    throw new Error("OW_PROXY_TOKEN is required in production")
  }
  return DEFAULT_DEV_PROXY_TOKEN
}

export function resolveLogLevelEnv() {
  return readEnv("OW_LOG_LEVEL")
}

export function validateServerEnv() {
  resolveProxyToken()
  getOpenwriteNamespace()
}
