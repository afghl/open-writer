import { proxyErrorResponse, proxyFetch, relayResponse } from "@/lib/openwrite-server"

export async function GET() {
  try {
    const upstream = await proxyFetch({
      pathname: "/api/projects",
      method: "GET",
    })
    return relayResponse(upstream)
  } catch (error) {
    return proxyErrorResponse(error)
  }
}
