import "server-only"
import { readRenderBody } from "@/lib/render/request"
import { z } from "zod"
import { createServerSupabase } from "@/lib/supabase/server"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { getRender, prepareRender, startRender } from "@/lib/render/service"
import { renderInputSchema } from "@/lib/render/contracts"
export const handleRenderWeb = async (request: Request) => {
  const headers = { "Cache-Control": "no-store" }
  if (
    request.method === "POST" &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return Response.json(
      { error: "Please open this page in CreativeOtter." },
      { status: 403, headers },
    )
  const client = await createServerSupabase()
  if (!(await client.auth.getUser()).data.user)
    return Response.json(
      { error: "Please sign in to CreativeOtter." },
      { status: 401, headers },
    )
  const { supabase, workspace } = await getPersonalWorkspace("/studio/designs")
  try {
    if (request.method === "GET") {
      const id = z.uuid().parse(new URL(request.url).searchParams.get("id"))
      return Response.json(await getRender(supabase, workspace.id, id), {
        headers,
      })
    }
    if (Number(request.headers.get("content-length") || 0) > 50000)
      throw new Error("This design is too large.")
    const text = await readRenderBody(request, 50000)
    if (text.length > 50000) throw new Error("This design is too large.")
    const { input, request_key } = z
      .object({ input: renderInputSchema, request_key: z.uuid() })
      .strict()
      .parse(JSON.parse(text))
    const quote = await prepareRender(
      supabase,
      workspace.id,
      input,
      request_key,
    )
    await startRender(supabase, quote.id)
    return Response.json(await getRender(supabase, workspace.id, quote.id), {
      headers,
    })
  } catch (error) {
    return Response.json(
      {
        code:
          error instanceof Error &&
          error.message === "Please prepare this design again"
            ? "quote_expired"
            : undefined,
        error:
          error instanceof z.ZodError
            ? "Please check your design settings."
            : error instanceof Error
              ? error.message
              : "We couldn’t open this design.",
      },
      { status: 400, headers },
    )
  }
}
