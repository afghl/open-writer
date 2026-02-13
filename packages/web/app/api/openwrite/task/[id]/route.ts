import { proxyErrorResponse, proxyFetch, relayResponse } from "@/lib/openwrite-server"

const PROJECT_ID_HEADER = "x-project-id"

type Params = {
  id: string
}

export async function GET(request: Request, context: { params: Promise<Params> }) {
  const projectID = request.headers.get(PROJECT_ID_HEADER)?.trim() ?? ""
  if (!projectID) {
    return Response.json({ error: "Project ID is required" }, { status: 400 })
  }

  const params = await context.params
  const taskID = params.id?.trim()
  if (!taskID) {
    return Response.json({ error: "Task ID is required" }, { status: 400 })
  }

  try {
    const upstream = await proxyFetch({
      pathname: `/api/task/${encodeURIComponent(taskID)}`,
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

