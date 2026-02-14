import { proxyErrorResponse, proxyFetch, relayResponse } from "@/lib/openwrite-server"

const PROJECT_ID_HEADER = "x-project-id"

export async function GET(request: Request) {
  const projectID = request.headers.get(PROJECT_ID_HEADER)?.trim() ?? ""
  if (!projectID) {
    return Response.json({ error: "Project ID is required" }, { status: 400 })
  }

  try {
    const upstream = await proxyFetch({
      pathname: "/api/library/docs",
      method: "GET",
      headers: {
        [PROJECT_ID_HEADER]: projectID,
      },
    })
    return relayResponse(upstream)
  } catch (error) {
    return proxyErrorResponse(error)
  }
}
