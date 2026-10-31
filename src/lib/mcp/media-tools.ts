import { z } from "zod"
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, McpContext } from "@/lib/database.types"
import {
  imageInputSchema,
  IMAGE_MODEL,
  generationSnapshotSchema,
} from "@/lib/media/contracts"
import {
  getMediaAccess,
  prepareImageQuote,
  getGenerationSnapshot,
} from "@/lib/media/service"
import {
  beginMediaUpload,
  finishMediaUpload,
  signAsset,
} from "@/lib/media/assets"
import {
  GENERATION_RESOURCE_URI,
  registerGenerationResource,
} from "@/lib/mcp/generation-resource"

export const MEDIA_TOOLS = [
  "list_models",
  "get_model_params",
  "estimate_generation",
  "generate_image",
  "check_job",
  "create_upload_url",
  "complete_upload",
  "manage_assets",
]
const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}
const write = { ...readOnly, readOnlyHint: false, idempotentHint: false }
const reply = (data: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
  structuredContent: data,
})
const safe = async (callback: () => Promise<Record<string, unknown>>) => {
  try {
    return reply(await callback())
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text:
            error instanceof Error
              ? error.message
              : "CreativeOtter could not complete this request",
        },
      ],
    }
  }
}

export const registerMediaTools = (
  server: McpServer,
  client: SupabaseClient<Database>,
  context: McpContext,
  appUrl: string,
) => {
  registerGenerationResource(server, appUrl)
  const access = () => getMediaAccess(client, context.workspace.id)
  const requireMedia = async (prepare = false) => {
    const state = await access()
    if (!state.enabled || !state.can_read || (prepare && !state.can_prepare))
      throw new Error(
        `Media access is not enabled for this connection. Open ${appUrl}/dashboard and enable media preparation for this application. It still cannot approve paid generations.`,
      )
    return state
  }
  const meta = { securitySchemes: [{ type: "oauth2", scopes: ["email"] }] }
  server.registerTool(
    "list_models",
    {
      title: "CreativeOtter models",
      description:
        "List only models implemented by this CreativeOtter backend, with current availability. Does not start generation.",
      inputSchema: { category: z.literal("image").optional() },
      annotations: readOnly,
      _meta: meta,
    },
    async () =>
      safe(async () => {
        const state = await access()
        return {
          models: [
            {
              id: IMAGE_MODEL,
              name: "Nano Banana 2",
              category: "image",
              available:
                state.provider_ready &&
                state.enabled &&
                state.can_prepare &&
                state.provider_budget_enabled &&
                state.credit_pricing_enabled,
              operations: ["text_to_image", "reference_image_edit"],
              parameters_tool: "get_model_params",
            },
          ],
          unsupported_categories: [
            "video",
            "speech",
            "music",
            "sound_effects",
            "editing",
          ],
          message:
            "This catalog describes provider models only. Use a matching native host tool first when available. Only the image provider adapter is implemented; other native workflows depend on the host.",
        }
      }),
  )
  server.registerTool(
    "get_model_params",
    {
      title: "Image model parameters",
      description:
        "Get the exact supported input schema for the implemented image model. Never infer inputs or prices from copied skills.",
      inputSchema: { model: z.literal(IMAGE_MODEL) },
      annotations: readOnly,
      _meta: meta,
    },
    async () =>
      safe(async () => ({
        model: IMAGE_MODEL,
        input_schema: z.toJSONSchema(imageInputSchema),
        num_images: 1,
        output_format: "png",
        reference_limit: 14,
        reference_source:
          "ready private CreativeOtter asset IDs; create_upload_url and complete_upload prepare references",
        approval:
          "estimate_generation prepares a bound quote; generate_image opens the review panel; only an authenticated browser approval can start the job",
        pricing:
          "Obtain the current maximum provider estimate from estimate_generation. The quote binds a versioned credit price; approval reserves that amount from the shared workspace wallet. Purchases are not enabled.",
      })),
  )
  server.registerTool(
    "estimate_generation",
    {
      title: "Review image generation",
      description:
        "Prepare a bound, expiring quote for exactly one image using owned reference assets. Does not submit to a provider or spend funds. Inputs cannot change after approval.",
      inputSchema: {
        operation: z.literal("image").default("image"),
        model: z.literal(IMAGE_MODEL).default(IMAGE_MODEL),
        ...imageInputSchema.shape,
        idempotency_key: z.uuid().optional(),
      },
      annotations: write,
      _meta: meta,
    },
    async (args) =>
      safe(async () => {
        await requireMedia(true)
        const input = imageInputSchema.parse({
          prompt: args.prompt,
          aspect_ratio: args.aspect_ratio,
          resolution: args.resolution,
          reference_asset_ids: args.reference_asset_ids,
        })
        const quote = await prepareImageQuote(
          client,
          context.workspace.id,
          input,
          args.idempotency_key,
        )
        return await getGenerationSnapshot(
          client,
          context.workspace.id,
          quote.id,
          false,
        )
      }),
  )
  registerAppTool(
    server,
    "generate_image",
    {
      title: "Generate image",
      description:
        "Open the CreativeOtter image panel for an existing bound quote. If awaiting approval, the user must review and approve in the authenticated browser. This tool cannot approve paid work or change quoted inputs. For an approved quote it shows the existing job and private saved output.",
      inputSchema: { quote_id: z.uuid() },
      outputSchema: generationSnapshotSchema.shape,
      annotations: readOnly,
      _meta: {
        ...meta,
        ui: {
          resourceUri: GENERATION_RESOURCE_URI,
          visibility: ["model", "app"],
        },
        "openai/outputTemplate": GENERATION_RESOURCE_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Opening your image…",
        "openai/toolInvocation/invoked": "Opened your image",
      },
    },
    async ({ quote_id }) =>
      safe(async () => {
        await requireMedia()
        return await getGenerationSnapshot(
          client,
          context.workspace.id,
          quote_id,
        )
      }),
  )
  server.registerTool(
    "check_job",
    {
      title: "Image progress",
      description:
        "Check or reconcile an existing image quote/job. Returns actual provider/save state and fresh signed asset URLs. Does not create a new generation, approve charges, or resubmit an uncertain request.",
      inputSchema: { quote_id: z.uuid() },
      annotations: readOnly,
      _meta: {
        ...meta,
        ui: { visibility: ["model", "app"] },
        "openai/widgetAccessible": true,
      },
    },
    async ({ quote_id }) =>
      safe(async () => {
        await requireMedia()
        return await getGenerationSnapshot(
          client,
          context.workspace.id,
          quote_id,
        )
      }),
  )
  server.registerTool(
    "create_upload_url",
    {
      title: "Upload a reference image",
      description:
        "Prepare a private reference upload scoped to this workspace. PUT the selected PNG/JPEG/WebP bytes to signed_url with the exact content type, then call complete_upload. Maximum 12 MB. Never send provider/API keys.",
      inputSchema: {
        filename: z.string().min(1).max(160),
        mime_type: z.enum(["image/png", "image/jpeg", "image/webp"]),
      },
      annotations: write,
      _meta: meta,
    },
    async ({ filename, mime_type }) =>
      safe(async () => {
        await requireMedia(true)
        return {
          ...(await beginMediaUpload(
            client,
            context.workspace.id,
            filename,
            mime_type,
          )),
          method: "PUT",
          max_bytes: 12582912,
          library_url: `${appUrl}/studio/library`,
        }
      }),
  )
  server.registerTool(
    "complete_upload",
    {
      title: "Validate reference upload",
      description:
        "Validate an already-uploaded private reference image and make its asset ID available to image quotes.",
      inputSchema: { asset_id: z.uuid() },
      annotations: { ...write, idempotentHint: true },
      _meta: meta,
    },
    async ({ asset_id }) =>
      safe(async () => {
        await requireMedia(true)
        return {
          asset: await finishMediaUpload(
            client,
            context.workspace.id,
            asset_id,
          ),
        }
      }),
  )
  server.registerTool(
    "manage_assets",
    {
      title: "CreativeOtter library",
      description:
        "Read the latest saved/reference assets, inspect a private asset or update its favorite flag. Never access another workspace or regenerate missing media.",
      inputSchema: {
        action: z.enum(["list", "get", "favorite"]).default("list"),
        asset_id: z.uuid().optional(),
        favorite: z.boolean().optional(),
      },
      annotations: { ...write, idempotentHint: true },
      _meta: {
        ...meta,
        ui: { visibility: ["model", "app"] },
        "openai/widgetAccessible": true,
      },
    },
    async ({ action, asset_id, favorite }) =>
      safe(async () => {
        await requireMedia(action === "favorite")
        if (action === "favorite") {
          if (!asset_id || favorite === undefined)
            throw new Error("asset_id and favorite are required")
          const { data, error } = await client.rpc("set_media_favorite", {
            target_asset: asset_id,
            is_favorite: favorite,
          })
          if (error || !data) throw new Error("Unable to update this asset")
          return { asset: await signAsset(client, data) }
        }
        let query = client
          .from("media_assets")
          .select("*")
          .eq("workspace_id", context.workspace.id)
          .eq("status", "ready")
          .order("created_at", { ascending: false })
          .limit(50)
        if (action === "get") {
          if (!asset_id) throw new Error("asset_id is required")
          query = query.eq("id", asset_id)
        }
        const result = await query
        if (result.error) throw new Error("Unable to open your library")
        return {
          assets: await Promise.all(
            (result.data || []).map((asset) => signAsset(client, asset)),
          ),
          limit: 50,
          library_url: `${appUrl}/studio/library`,
        }
      }),
  )
}
