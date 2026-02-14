import { proxyErrorResponse, proxyFetch, relayResponse } from "@/lib/openwrite-server"

const PROJECT_ID_HEADER = "x-project-id"

export async function POST(request: Request) {
  const projectID = request.headers.get(PROJECT_ID_HEADER)?.trim() ?? ""
  if (!projectID) {
    return Response.json({ error: "Project ID is required" }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: "Invalid multipart/form-data body" }, { status: 400 })
  }

  try {
    const upstream = await proxyFetch({
      pathname: "/api/library/import",
      method: "POST",
      headers: {
        [PROJECT_ID_HEADER]: projectID,
      },
      body: formData,
    })
    return relayResponse(upstream)
  } catch (error) {
    return proxyErrorResponse(error)
  }
}
