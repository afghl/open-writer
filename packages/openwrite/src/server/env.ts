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

export function resolvePineconeEnv() {
  return {
    apiKey: readEnv("PINECONE_API_KEY"),
    indexName: readEnv("OW_PINECONE_INDEX"),
  }
}

export function validatePineconeEnv() {
  const config = resolvePineconeEnv()
  if ((config.apiKey && !config.indexName) || (!config.apiKey && config.indexName)) {
    throw new Error("PINECONE_API_KEY and OW_PINECONE_INDEX must be configured together")
  }
}

export function validateServerEnv() {
  resolveProxyToken()
  validatePineconeEnv()
  getOpenwriteNamespace()
}
