import { proxyErrorResponse, proxyFetch, relayResponse } from "@/lib/openwrite-server"

const PROJECT_ID_HEADER = "x-project-id"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const projectID = request.headers.get(PROJECT_ID_HEADER)?.trim() ?? ""
  if (!projectID) {
    return Response.json({ error: "Project ID is required" }, { status: 400 })
  }

  const { id } = await params
  const importID = id?.trim() ?? ""
  if (!importID) {
    return Response.json({ error: "Import ID is required" }, { status: 400 })
  }

  try {
    const upstream = await proxyFetch({
      pathname: `/api/library/import/${encodeURIComponent(importID)}`,
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
