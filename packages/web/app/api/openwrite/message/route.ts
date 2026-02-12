import { proxyErrorResponse, proxyFetch, relayResponse } from "@/lib/openwrite-server"

const PROJECT_ID_HEADER = "x-project-id"

export async function POST(request: Request) {
  const projectID = request.headers.get(PROJECT_ID_HEADER)?.trim() ?? ""
  if (!projectID) {
    return Response.json({ error: "Project ID is required" }, { status: 400 })
  }

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
      pathname: "/api/message",
      method: "POST",
      headers: {
        [PROJECT_ID_HEADER]: projectID,
        "content-type": "application/json",
      },
      body,
    })
    return relayResponse(upstream)
  } catch (error) {
    return proxyErrorResponse(error)
  }
}
