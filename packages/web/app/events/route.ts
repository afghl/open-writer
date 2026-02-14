import { proxyErrorResponse, proxyFetch, relayStreamResponse } from "@/lib/openwrite-server"

export const maxDuration = 300

const PROJECT_ID_HEADER = "x-project-id"

// Backward-compatible alias for /events/fs.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const projectID = url.searchParams.get("project_id")?.trim() ?? ""
  if (!projectID) {
    return Response.json({ error: "project_id is required" }, { status: 400 })
  }

  try {
    const upstream = await proxyFetch({
      pathname: "/event/fs",
      method: "GET",
      headers: {
        accept: "text/event-stream",
        [PROJECT_ID_HEADER]: projectID,
      },
      timeoutMs: null,
    })
    return relayStreamResponse(upstream)
  } catch (error) {
    return proxyErrorResponse(error)
  }
}
