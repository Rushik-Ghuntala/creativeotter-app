import { registerMotionTools, MOTION_TOOLS } from "@/lib/mcp/motion-tools"
import { z } from "zod"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, McpContext } from "@/lib/database.types"
import { getPublicEnv } from "@/lib/env"
import { renderInputSchema, renderingEnabled } from "@/lib/render/contracts"
import {
  getRender,
  getRenderStatus,
  prepareRender,
  startRender,
  createRenderPreview,
} from "@/lib/render/service"
import { customerFacingResult } from "@/lib/mcp/presentation"
export const RENDER_TOOLS = [
  ...MOTION_TOOLS,
  "prepare_render",
  "render_design",
  "get_render",
  "get_render_status",
  "list_renders",
]
export const RENDER_RESOURCE_URI = "ui://creativeotter/render-v2.html"
export const registerRenderTools = (
  server: McpServer,
  client: SupabaseClient<Database>,
  context: McpContext,
  appUrl: string,
) => {
  // An environment gate keeps unreleased render tools out of production catalogs.
  if (!renderingEnabled()) return
  registerMotionTools(server, client, context)
  const storage = new URL(getPublicEnv().url).origin
  const ui = {
    prefersBorder: false,
    domain: appUrl,
    csp: { connectDomains: [appUrl], resourceDomains: [storage] },
  }
  for (const uri of [RENDER_RESOURCE_URI, "ui://creativeotter/render-v1.html"])
    registerAppResource(
      server,
      "CreativeOtter design preview",
      uri,
      { _meta: { ui } },
      async () => ({
        contents: [
          {
            uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: await readFile(
              join(process.cwd(), "src/lib/mcp/ui/dist/render.html"),
              "utf8",
            ),
            _meta: {
              ui,
              "openai/widgetDescription":
                "CreativeOtter saved design with image or video playback, live progress, automatic private-link refresh and download.",
              "openai/widgetCSP": {
                connect_domains: [appUrl],
                resource_domains: [storage],
                redirect_domains: [storage, appUrl],
              },
            },
          },
        ],
      }),
    )
  const security = { securitySchemes: [{ type: "oauth2", scopes: ["email"] }] }
  const previewMeta = {
    ...security,
    ui: { resourceUri: RENDER_RESOURCE_URI, visibility: ["model", "app"] },
    "openai/outputTemplate": RENDER_RESOURCE_URI,
    "openai/widgetAccessible": true,
  }
  const read = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  }
  const safe = async (run: () => Promise<unknown>) => {
    try {
      return (await run()) as Awaited<ReturnType<typeof result>>
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              error instanceof z.ZodError
                ? "Please check the design settings."
                : error instanceof Error
                  ? error.message
                  : "We couldn’t finish this design.",
          },
        ],
      }
    }
  }
  const result = async (id: string) => ({
    ...customerFacingResult(await getRender(client, context.workspace.id, id)),
    _meta: {
      "creativeotter/render-access": await createRenderPreview(client, id),
    },
  })
  server.registerTool(
    "prepare_render",
    {
      title: "Estimate design rendering",
      description:
        "Estimate a motion-graphics MP4 from a saved HyperFrames revision. Use save_motion_project or prepare_motion_upload first, then pass its render_input including engine=hyperframes and revision_id. Supports nested JavaScript/GSAP timelines, bundled media and audio, 1–30 seconds, 12/24/25/30fps. No credits reserved or spent by an estimate. Legacy self-contained CSS layouts remain compatible. Ordinary still images use image generation instead. Never quote an image model for motion rendering.",
      inputSchema: { ...renderInputSchema.shape, request_key: z.uuid() },
      annotations: { ...read, readOnlyHint: false },
      _meta: security,
    },
    (args) =>
      safe(async () => {
        const { request_key, ...input } = args
        const job = await prepareRender(
          client,
          context.workspace.id,
          renderInputSchema.parse(input),
          request_key,
        )
        return customerFacingResult(
          await getRender(client, context.workspace.id, job.id),
        )
      }),
  )
  registerAppTool(
    server,
    "render_design",
    {
      title: "Render design",
      description:
        "Start the user's requested design directly from its prepared render_id. Reserves the quoted CreativeOtter credits once, renders without fal.ai, saves privately, then charges once on successful delivery. No extra approval needed for an explicit generation request. Repeated calls do not create or charge another render. This opens the single CreativeOtter player, which updates automatically. If you need progress checks, use get_render_status; never poll get_render or embed another raw video in the final reply. Reuse this player for the result.",
      inputSchema: { render_id: z.uuid() },
      annotations: { ...read, readOnlyHint: false },
      _meta: previewMeta,
    },
    ({ render_id }) =>
      safe(async () => {
        await startRender(client, render_id)
        return result(render_id)
      }),
  )
  registerAppTool(
    server,
    "get_render",
    {
      title: "Open saved design",
      description:
        "Open the CreativeOtter player only when the user asks to view or reopen an existing saved design. Each model call opens another player: never use this tool for progress polling after render_design. Use get_render_status instead. Widget refresh calls remain supported. Never starts rendering or spends credits. Reply briefly without IDs or a second raw video embed.",
      inputSchema: { render_id: z.uuid() },
      annotations: read,
      _meta: previewMeta,
    },
    ({ render_id }) => safe(() => result(render_id)),
  )
  server.registerTool(
    "get_render_status",
    {
      title: "Check design progress",
      description:
        "Check an existing render without opening another player. Use for progress polling after render_design; the original CreativeOtter player updates automatically. Returns status only, with no media URLs, preview credential or UI template. Never starts rendering, saves a new file or spends credits. Once saved, reply briefly and refer to the existing player; do not call get_render or embed a duplicate video unless the user asks to reopen it.",
      inputSchema: { render_id: z.uuid() },
      annotations: read,
      _meta: security,
    },
    ({ render_id }) =>
      safe(async () =>
        customerFacingResult(
          await getRenderStatus(client, context.workspace.id, render_id),
        ),
      ),
  )
  server.registerTool(
    "list_renders",
    {
      title: "Saved designs",
      description:
        "Find existing CreativeOtter rendered designs and motion-graphics videos. Use titles and get_render for the preview; do not generate replacements for saved-work requests.",
      inputSchema: { limit: z.number().int().min(1).max(20).default(10) },
      annotations: read,
      _meta: security,
    },
    async ({ limit }) => {
      const { data, error } = await client
        .from("render_jobs")
        .select("id,input,state,created_at")
        .eq("workspace_id", context.workspace.id)
        .eq("state", "succeeded")
        .order("created_at", { ascending: false })
        .limit(limit)
      if (error)
        return {
          isError: true,
          content: [
            { type: "text", text: "We couldn’t open your saved designs." },
          ],
        }
      return customerFacingResult({
        designs: data?.map((row) => ({
          render_id: row.id,
          title: row.input.title,
          format: row.input.format,
        })),
        message: "Here are your saved designs.",
      })
    },
  )
}
