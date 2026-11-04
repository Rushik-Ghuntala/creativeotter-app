import "server-only"
import { authenticateMcp } from "@/lib/mcp/auth"
import { decryptPreviewAccess } from "@/lib/mcp/preview-access"
import { previewReferenceSchema } from "@/lib/mcp/preview-access-contracts"
import { readExistingGenerationStatus } from "@/lib/media/status"
import { getAppUrl } from "@/lib/env"

export const isPreviewOriginAllowed = (origin: string | null) => {
  if (!origin || origin === "null" || origin === getAppUrl()) return true
  try {
    const url = new URL(origin)
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      (["https://claude.ai", "https://chatgpt.com"].includes(origin) ||
        url.hostname.endsWith(".claudemcpcontent.com") ||
        url.hostname.endsWith(".oaiusercontent.com"))
    )
  } catch {
    return false
  }
}
type Dependencies = {
  authenticate: typeof authenticateMcp
  readStatus: typeof readExistingGenerationStatus
}
const dependencies: Dependencies = {
  authenticate: authenticateMcp,
  readStatus: readExistingGenerationStatus,
}
export const handlePreviewStatus = async (
  request: Request,
  deps: Dependencies = dependencies,
) => {
  const origin = request.headers.get("origin")
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  })
  const json = (error: string, status: number) =>
    Response.json({ error }, { status, headers })
  if (!isPreviewOriginAllowed(origin)) return json("Origin is not allowed", 403)
  if (origin) headers.set("Access-Control-Allow-Origin", origin)
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers })
  if (request.method !== "POST") return json("Method is not allowed", 405)
  const token = /^Bearer ([A-Za-z0-9._~-]{1,20000})$/.exec(
    request.headers.get("authorization") || "",
  )?.[1]
  if (!token) return json("Reopen this existing image from your assistant", 401)
  let grant
  try {
    grant = await decryptPreviewAccess(token)
  } catch {
    return json(
      "Preview access expired or is invalid. Reopen this existing image from your assistant.",
      401,
    )
  }
  let reference
  try {
    if (Number(request.headers.get("content-length") || 0) > 2048)
      return json("Invalid image reference", 400)
    const text = await request.text()
    if (text.length > 2048) return json("Invalid image reference", 400)
    reference = previewReferenceSchema.parse(JSON.parse(text))
  } catch {
    return json("Invalid image reference", 400)
  }
  if (
    !grant.generations.some(
      (item) =>
        item.generation_id === reference.generation_id &&
        item.execution_source === reference.execution_source,
    )
  )
    return json("This preview is limited to its existing images", 403)
  // The encrypted delegation is read-only and scoped; original OAuth verification,
  // live grants, membership and RLS are still checked on every status request.
  const auth = await deps.authenticate(
    new Request(`${getAppUrl()}/api/mcp`, {
      headers: { Authorization: `Bearer ${grant.access_token}` },
    }),
  )
  if (!auth)
    return json(
      "Sign-in expired. Reopen this existing image from your assistant.",
      401,
    )
  if (auth.actor.sub !== grant.sub || auth.actor.client_id !== grant.client_id)
    return json("Preview access denied", 403)
  const { data: context, error } = await auth.supabase.rpc("get_mcp_context")
  if (
    error ||
    !context ||
    context.user_id !== grant.sub ||
    context.client_id !== grant.client_id ||
    context.workspace.id !== grant.workspace_id
  )
    return json("Workspace access is missing or revoked", 403)
  try {
    const snapshot = await deps.readStatus(
      auth.supabase,
      grant.workspace_id,
      reference,
    )
    return Response.json(snapshot, { headers })
  } catch {
    return json("This existing image is unavailable", 403)
  }
}
