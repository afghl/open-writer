import { proxyErrorResponse, relayResponse, upstreamURL } from "@/lib/openwrite-server"

export async function GET() {
  try {
    const upstream = await fetch(upstreamURL("/api/projects"), {
      method: "GET",
      cache: "no-store",
    })
    return relayResponse(upstream)
  } catch (error) {
    return proxyErrorResponse(error)
  }
}
