import { proxyErrorResponse, relayResponse, upstreamURL } from "@/lib/openwrite-server"

const PROJECT_ID_HEADER = "x-project-id"

export async function GET(request: Request) {
  const projectID = request.headers.get(PROJECT_ID_HEADER)?.trim() ?? ""
  if (!projectID) {
    return Response.json({ error: "Project ID is required" }, { status: 400 })
  }

  try {
    const query = new URL(request.url).searchParams.toString()
    const upstream = await fetch(upstreamURL("/api/fs/read", query), {
      method: "GET",
      headers: {
        [PROJECT_ID_HEADER]: projectID,
      },
      cache: "no-store",
    })
    return relayResponse(upstream)
  } catch (error) {
    return proxyErrorResponse(error)
  }
}
