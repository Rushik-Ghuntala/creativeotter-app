import "server-only"
import { z } from "zod"
import { strToU8 } from "fflate"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { createServerSupabase } from "@/lib/supabase/server"
import { readRenderBody } from "@/lib/render/request"
import {
  beginMotionUpload,
  readMotionSource,
  saveMotionRevision,
} from "@/lib/render/project-service"
import {
  MOTION_SOURCE_BUCKET,
  archiveProjectFiles,
  motionSettingsSchema,
  packProject,
  projectFilesSchema,
  readProjectZip,
  validProjectPath,
} from "@/lib/render/project"
const details = z.object({
  title: z.string().trim().min(1).max(120),
  settings: motionSettingsSchema,
  parent_id: z.uuid().nullable().optional(),
  change_summary: z.string().max(300).optional(),
  request_key: z.uuid(),
})
const bodySchema = z.discriminatedUnion("action", [
  details.extend({ action: z.literal("save"), files: projectFilesSchema }),
  details.extend({
    action: z.literal("upload"),
    source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    source_bytes: z.number().int().min(22).max(26214400),
  }),
  details.extend({
    action: z.literal("revise"),
    parent_id: z.uuid(),
    changes: z
      .array(z.object({ path: z.string(), content: z.string().max(512000) }))
      .max(128),
  }),
  z.object({ action: z.literal("confirm"), revision_id: z.uuid() }),
])
export const handleMotionWeb = async (request: Request) => {
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
    const describe = async (id: string) => {
      const { revision, zip } = await readMotionSource(
        supabase,
        workspace.id,
        id,
      )
      const files = readProjectZip(zip)
      const source = await supabase.storage
        .from(MOTION_SOURCE_BUCKET)
        .createSignedUrl(revision.source_path, 600, {
          download: `${revision.title.replace(/[^a-zA-Z0-9-]+/g, "-")}-v${revision.version}.zip`,
        })
      const history = await supabase
        .from("motion_revisions")
        .select("id,title,version,created_at,change_summary")
        .eq("project_id", revision.project_id)
        .eq("workspace_id", workspace.id)
        .order("version", { ascending: false })
      return {
        revision,
        source_url: source.data?.signedUrl,
        files: Object.entries(files)
          .filter(([path]) => /\.(html|css|js|json|md|txt)$/i.test(path))
          .map(([path, bytes]) => ({
            path,
            content: new TextDecoder().decode(bytes),
          })),
        history: history.data || [],
      }
    }
    if (request.method === "GET") {
      const id = new URL(request.url).searchParams.get("id")
      if (id)
        return Response.json(await describe(z.uuid().parse(id)), { headers })
      const result = await supabase
        .from("motion_revisions")
        .select("id,project_id,title,version,created_at")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(50)
      if (result.error)
        throw new Error("We couldn’t open your motion projects.")
      return Response.json({ projects: result.data }, { headers })
    }
    const value = bodySchema.parse(
      JSON.parse(await readRenderBody(request, 2400000)),
    )
    if (value.action === "upload")
      return Response.json(
        await beginMotionUpload(supabase, workspace.id, value),
        { headers },
      )
    if (value.action === "confirm")
      return Response.json(await describe(value.revision_id), { headers })
    let zip: Uint8Array
    if (value.action === "revise") {
      const saved = await readMotionSource(
        supabase,
        workspace.id,
        value.parent_id,
      )
      const files = readProjectZip(saved.zip)
      for (const change of value.changes) {
        validProjectPath(change.path)
        if (!/\.(html|css|js|json|md|txt)$/i.test(change.path))
          throw new Error("Only project source files can be edited here.")
        files[change.path] = strToU8(change.content)
      }
      zip = archiveProjectFiles(files)
    } else zip = packProject(value.files)
    const revision = await saveMotionRevision(
      supabase,
      workspace.id,
      zip,
      value,
    )
    return Response.json(await describe(revision.id), { headers })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? "Please check your motion project settings."
            : error instanceof Error
              ? error.message
              : "We couldn’t save this motion project.",
      },
      { status: 400, headers },
    )
  }
}
