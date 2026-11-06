import "server-only"
import { readRenderBody } from "@/lib/render/request"
import { z } from "zod"
import { isPreviewOriginAllowed } from "@/lib/mcp/preview-status-handler"
import { readRenderPreview } from "@/lib/render/service"
export const handleRenderPreview = async (request: Request) => {
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
  const token = /^Bearer (rp1\.[A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") || "",
  )?.[1]
  if (!token) return json("Open this design from CreativeOtter again.", 401)
  try {
    if (Number(request.headers.get("content-length") || 0) > 200)
      return json("Invalid design", 400)
    const text = await readRenderBody(request, 200)
    if (text.length > 200) return json("Invalid design", 400)
    const body = z
      .object({ render_id: z.uuid() })
      .strict()
      .parse(JSON.parse(text))
    return Response.json(await readRenderPreview(token, body.render_id), {
      headers,
    })
  } catch {
    return json("This design is unavailable or access was removed.", 403)
  }
}
