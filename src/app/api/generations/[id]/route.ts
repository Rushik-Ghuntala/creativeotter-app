import { z } from "zod"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { getGenerationSnapshot } from "@/lib/media/service"
import { getNativeSnapshot } from "@/lib/media/native"
export const dynamic = "force-dynamic"
export const maxDuration = 60
export const GET = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "Invalid generation" }, { status: 400 })
  const source = new URL(request.url).searchParams.get("source")
  if (!["native", "provider"].includes(source || ""))
    return Response.json({ error: "Invalid source" }, { status: 400 })
  const { supabase, workspace } = await getPersonalWorkspace()
  try {
    const snapshot =
      source === "native"
        ? await getNativeSnapshot(supabase, workspace.id, id)
        : await getGenerationSnapshot(supabase, workspace.id, id)
    return Response.json(snapshot, {
      headers: { "Cache-Control": "no-store", Vary: "Cookie" },
    })
  } catch {
    return Response.json(
      { error: "Generation unavailable" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    )
  }
}
