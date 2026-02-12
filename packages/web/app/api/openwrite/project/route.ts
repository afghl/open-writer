import { proxyErrorResponse, relayResponse, upstreamURL } from "@/lib/openwrite-server"

export async function POST(request: Request) {
  let body = "{}"
  try {
    const raw = await request.text()
    if (raw.trim().length > 0) {
      body = raw
    }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }

  try {
    const upstream = await fetch(upstreamURL("/api/project"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body,
      cache: "no-store",
    })
    return relayResponse(upstream)
  } catch (error) {
    return proxyErrorResponse(error)
  }
}
