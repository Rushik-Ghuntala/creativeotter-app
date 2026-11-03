import { z } from "zod"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { getProjectDetails } from "@/lib/studio/service"
export const runtime = "nodejs"
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const parsed = z.uuid().safeParse((await params).id)
  if (!parsed.success)
    return Response.json({ error: "Invalid project" }, { status: 400 })
  const { supabase, workspace } = await getPersonalWorkspace()
  const { data: project } = await supabase
    .from("studio_projects")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("id", parsed.data)
    .single()
  if (!project)
    return Response.json({ error: "Project not found" }, { status: 404 })
  const details = await getProjectDetails(supabase, workspace.id, project.id)
  const payload = {
    product: "CreativeOtter",
    schema_version: 1,
    exported_at: new Date().toISOString(),
    project,
    shots: details.shots,
    assets: details.assets.map(({ id, label, mime_type, width, height }) => ({
      id,
      label,
      mime_type,
      width,
      height,
    })),
    historical_assigned_charge_units: details.charged_units,
    budget_target_is_enforced: false,
  }
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="creativeotter-project-${project.id}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
