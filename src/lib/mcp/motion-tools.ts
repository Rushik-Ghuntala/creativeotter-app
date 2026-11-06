import { z } from "zod"
import { strToU8 } from "fflate"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, McpContext } from "@/lib/database.types"
import {
  MOTION_SOURCE_BUCKET,
  archiveProjectFiles,
  motionSettingsSchema,
  packProject,
  projectFilesSchema,
  readProjectZip,
  validProjectPath,
} from "@/lib/render/project"
import {
  beginMotionUpload,
  readMotionSource,
  saveMotionRevision,
  motionRenderInput,
} from "@/lib/render/project-service"
import { customerFacingResult } from "@/lib/mcp/presentation"
export const MOTION_TOOLS = [
  "save_motion_project",
  "revise_motion_project",
  "get_motion_project",
  "list_motion_projects",
  "prepare_motion_upload",
  "confirm_motion_upload",
]
export const registerMotionTools = (
  server: McpServer,
  client: SupabaseClient<Database>,
  context: McpContext,
) => {
  const read = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  }
  const security = { securitySchemes: [{ type: "oauth2", scopes: ["email"] }] }
  const describe = async (id: string) => {
    const { revision, zip } = await readMotionSource(
      client,
      context.workspace.id,
      id,
    )
    const files = readProjectZip(zip)
    const source = await client.storage
      .from(MOTION_SOURCE_BUCKET)
      .createSignedUrl(revision.source_path, 600, {
        download: `creativeotter-project-v${revision.version}.zip`,
      })
    if (source.error)
      throw new Error("We couldn’t prepare this project download.")
    const history = await client
      .from("motion_revisions")
      .select("id,version,change_summary,created_at")
      .eq("project_id", revision.project_id)
      .eq("workspace_id", context.workspace.id)
      .order("version", { ascending: false })
    return customerFacingResult({
      revision_id: revision.id,
      project_id: revision.project_id,
      title: revision.title,
      version: revision.version,
      settings: revision.settings,
      render_input: motionRenderInput(revision),
      source_download_url: source.data.signedUrl,
      files: Object.entries(files)
        .filter(([name]) => /\.(html|css|js|json|md|txt)$/i.test(name))
        .map(([path, bytes]) => ({
          path,
          content: new TextDecoder().decode(bytes),
        })),
      asset_paths: Object.keys(files).filter(
        (name) => !/\.(html|css|js|json|md|txt)$/i.test(name),
      ),
      versions: history.data,
      message: `Your editable motion project is saved as version ${revision.version}. Saving and downloading it uses no credits.`,
    })
  }
  const safe = async (
    run: () => Promise<ReturnType<typeof customerFacingResult>>,
  ) => {
    try {
      return await run()
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              error instanceof z.ZodError
                ? "Please check your motion project settings."
                : error instanceof Error
                  ? error.message
                  : "We couldn’t open this motion project.",
          },
        ],
      }
    }
  }
  const details = {
    title: z.string().trim().min(1).max(120),
    settings: motionSettingsSchema,
    request_key: z.uuid(),
    change_summary: z.string().max(300).default(""),
  }
  server.registerTool(
    "save_motion_project",
    {
      title: "Save editable motion project",
      description:
        "Save a complete HyperFrames HTML/CSS/JavaScript project as an immutable private ZIP. No rendering or credits spent. Author code using the host assistant; never use fal.ai for pure motion. Include index.html, a sized root with data-composition-id/data-width/data-height/data-duration, and matching paused window.__timelines entry. Nested compositions and pinned GSAP 3.14.2 are supported; scripts use https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js, resolved locally. Bundle all other assets; no network/npm execution. MP4 only, 1–30 seconds, even dimensions 128–1920 and 12/24/25/30fps. Named audio/video clips need explicit data-start/data-duration, fixed data-media-start/playback-rate/data-volume; include their files. No speed ramps or audio automation yet. For large complete ZIPs use prepare_motion_upload and confirm_motion_upload. Then prepare_render with returned render_input, render_design and poll get_render for CreativeOtter's branded preview. Never expose source or IDs in the user reply unless requested.",
      inputSchema: { ...details, files: projectFilesSchema },
      annotations: { ...read, readOnlyHint: false },
      _meta: security,
    },
    (args) =>
      safe(async () => {
        const revision = await saveMotionRevision(
          client,
          context.workspace.id,
          packProject(args.files),
          args,
        )
        return describe(revision.id)
      }),
  )
  server.registerTool(
    "revise_motion_project",
    {
      title: "Save a new motion version",
      description:
        "Edit the user's saved motion project by replacing selected text source files while preserving bundled assets and every prior version. No credits spent; render separately only when requested. Use the latest revision to avoid overwriting someone else's work. Keep the root duration/size and settings consistent.",
      inputSchema: {
        ...details,
        parent_id: z.uuid(),
        changes: z
          .array(
            z.object({ path: z.string(), content: z.string().max(512000) }),
          )
          .min(1)
          .max(128),
      },
      annotations: { ...read, readOnlyHint: false },
      _meta: security,
    },
    (args) =>
      safe(async () => {
        const original = await readMotionSource(
          client,
          context.workspace.id,
          args.parent_id,
        )
        const files = readProjectZip(original.zip)
        for (const file of args.changes) {
          validProjectPath(file.path)
          if (!/\.(html|css|js|json|md|txt)$/i.test(file.path))
            throw new Error("Only source files can be changed by this tool.")
          files[file.path] = strToU8(file.content)
        }
        const revision = await saveMotionRevision(
          client,
          context.workspace.id,
          archiveProjectFiles(files),
          args,
        )
        return describe(revision.id)
      }),
  )
  server.registerTool(
    "get_motion_project",
    {
      title: "Open editable motion project",
      description:
        "Open an existing private motion project's editable source, version history and fresh project ZIP download. Read-only; no credits spent. Internal identifiers and source code stay in tool calls unless the user asks for them.",
      inputSchema: { revision_id: z.uuid() },
      annotations: read,
      _meta: security,
    },
    ({ revision_id }) => safe(() => describe(revision_id)),
  )
  server.registerTool(
    "list_motion_projects",
    {
      title: "Find saved motion projects",
      description:
        "Find saved editable motion projects before opening or revising them. No generation or credits spent. Describe them by title, not IDs.",
      inputSchema: { limit: z.number().int().min(1).max(40).default(20) },
      annotations: read,
      _meta: security,
    },
    ({ limit }) =>
      safe(async () => {
        const result = await client
          .from("motion_revisions")
          .select("id,project_id,title,version,created_at")
          .eq("workspace_id", context.workspace.id)
          .order("created_at", { ascending: false })
          .limit(limit)
        if (result.error)
          throw new Error("We couldn’t find your motion projects.")
        return customerFacingResult({
          projects: result.data,
          message: "Here are your saved motion projects.",
        })
      }),
  )
  server.registerTool(
    "prepare_motion_upload",
    {
      title: "Prepare private project upload",
      description:
        "Prepare a private signed upload for a complete HyperFrames project ZIP up to 25 MB (64 MB expanded, 256 entries). Send ZIP bytes with PUT and Content-Type application/zip to upload_url, then confirm_motion_upload. SHA-256 and byte size bind the immutable source. Never execute package scripts or install project dependencies. This only saves a project; it does not render or spend credits.",
      inputSchema: {
        ...details,
        source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
        source_bytes: z.number().int().min(22).max(26214400),
        parent_id: z.uuid().optional(),
      },
      annotations: { ...read, readOnlyHint: false },
      _meta: security,
    },
    (args) =>
      safe(async () => {
        const prepared = await beginMotionUpload(
          client,
          context.workspace.id,
          args,
        )
        return customerFacingResult({
          revision_id: prepared.revision.id,
          upload_url: prepared.upload_url,
          message: "Your private project upload is ready. No credits spent.",
        })
      }),
  )
  server.registerTool(
    "confirm_motion_upload",
    {
      title: "Check saved motion project",
      description:
        "Validate an uploaded project ZIP and its digest, then return its saved version and render settings. No rendering or credits spent.",
      inputSchema: { revision_id: z.uuid() },
      annotations: read,
      _meta: security,
    },
    ({ revision_id }) => safe(() => describe(revision_id)),
  )
}
