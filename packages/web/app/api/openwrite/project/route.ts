import { proxyErrorResponse, proxyFetch, relayResponse } from "@/lib/openwrite-server"

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
    const upstream = await proxyFetch({
      pathname: "/api/project",
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body,
    })
    return relayResponse(upstream)
  } catch (error) {
    return proxyErrorResponse(error)
  }
}
