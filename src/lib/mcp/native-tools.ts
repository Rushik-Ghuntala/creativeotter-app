import { attachPreviewAccess } from "@/lib/mcp/preview-access"
import { z } from "zod"
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, McpContext } from "@/lib/database.types"
import {
  routingRequestSchema,
  resolveExecutionRoute,
} from "@/lib/media/routing"
import { getMediaAccess } from "@/lib/media/service"
import {
  prepareNativeGeneration,
  prepareNativeOutput,
  finishNativeOutput,
  getNativeSnapshot,
} from "@/lib/media/native"
import {
  nativeInputSchema,
  nativeHostSchema,
  generationSnapshotSchema,
} from "@/lib/media/contracts"
import { GENERATION_RESOURCE_URI } from "@/lib/mcp/generation-resource"

export const NATIVE_TOOLS = [
  "prepare_native_generation",
  "claim_native_generation",
  "report_native_outcome",
  "create_native_output",
  "complete_native_output",
  "get_native_generation",
]
const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}
const meta = { securitySchemes: [{ type: "oauth2", scopes: ["email"] }] }
const safely = async (callback: () => Promise<Record<string, unknown>>) => {
  try {
    const data = await callback()
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
      structuredContent: data,
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text:
            error instanceof Error
              ? error.message
              : "Unable to open the native result",
        },
      ],
    }
  }
}

export const registerNativeTools = (
  server: McpServer,
  client: SupabaseClient<Database>,
  context: McpContext,
  previewAccessToken?: string,
) => {
  server.registerTool(
    "resolve_generation_route",
    {
      title: "Choose generation route",
      description:
        "Choose native-first or a configured API fallback using the current host's actually exposed tools. Native availability is reported by the assistant, not inferred from the backend. Never silently substitute an explicitly requested model, bypass a safety refusal or duplicate an uncertain native generation.",
      inputSchema: {
        operation: z
          .enum([
            "image",
            "video",
            "speech",
            "music",
            "sound_effects",
            "editing",
          ])
          .default("image"),
        ...routingRequestSchema.shape,
      },
      annotations: readOnly,
      _meta: meta,
    },
    async (args) =>
      safely(async () => {
        const access = await getMediaAccess(client, context.workspace.id)
        const supportedModel =
          !args.requested_model ||
          ["image/nano-banana-2", "nano-banana-2", "Nano Banana 2"].includes(
            args.requested_model,
          )
        const providerAvailable =
          supportedModel &&
          args.operation === "image" &&
          access.enabled &&
          access.can_prepare &&
          access.provider_budget_enabled &&
          access.credit_pricing_enabled &&
          access.provider_ready
        return {
          ...resolveExecutionRoute(
            routingRequestSchema.parse(args),
            providerAvailable,
          ),
          policy: "native_first",
          native_discovery:
            "Inspect the actual host tool inventory; installed skills alone do not prove a native generator exists.",
          provider_available: providerAvailable,
          native_credit_pricing_enabled: access.native_credit_pricing_enabled,
          native_credits_required: true,
          execution_authorized: false,
          native_usage:
            "CreativeOtter credits are required for native work. For an explicit user generation request, prepare_native_generation and a successful claim_native_generation that atomically reserves credits must precede the native tool. Host usage may also apply.",
        }
      }),
  )
  server.registerTool(
    "prepare_native_generation",
    {
      title: "Prepare native image quote",
      description:
        "Quote one native image BEFORE invoking any host generation tool. CreativeOtter credits apply even though no backend inference key is used. Requires configured native pricing and media access. For an explicit generation request, continue immediately to claim_native_generation to reserve credits and start once. Estimate-only requests stop at this quote. This tool never invokes generation.",
      inputSchema: {
        ...nativeInputSchema.shape,
        host: nativeHostSchema,
        reported_model: z.string().min(1).max(120).nullable().default(null),
        mime_type: z
          .enum(["image/png", "image/jpeg", "image/webp"])
          .default("image/png"),
        request_key: z.uuid(),
      },
      outputSchema: generationSnapshotSchema.shape,
      annotations: { ...readOnly, readOnlyHint: false },
      _meta: meta,
    },
    async (args) =>
      safely(() =>
        prepareNativeGeneration(
          client,
          context.workspace.id,
          nativeInputSchema.parse({
            prompt: args.prompt,
            aspect_ratio: args.aspect_ratio,
            resolution: args.resolution,
            reference_asset_ids: args.reference_asset_ids,
          }),
          args.host,
          args.reported_model,
          args.mime_type,
          args.request_key,
        ),
      ),
  )
  server.registerTool(
    "claim_native_generation",
    {
      title: "Generate native image",
      description:
        "Start a requested native image: atomically reserve its quoted credits and claim execution exactly once, without browser approval. Only a successful response with claimed=true authorizes calling the host native generator with the returned fixed inputs. Requires the original requesting client, current media permission, a valid quote and sufficient credits. A repeated/lost claim must be reconciled; never generate twice.",
      inputSchema: { generation_id: z.uuid() },
      annotations: { ...readOnly, readOnlyHint: false, idempotentHint: false },
      _meta: meta,
    },
    async ({ generation_id }) =>
      safely(async () => {
        const result = await client.rpc("claim_native_generation", {
          target_generation: generation_id,
        })
        if (result.error || !result.data)
          throw new Error(
            result.error?.message || "Native execution is not authorized",
          )
        return result.data
      }),
  )
  server.registerTool(
    "create_native_output",
    {
      title: "Upload paid native output",
      description:
        "Prepare an upload for the image produced by a paid and claimed native execution. Requires its generation_id and execution_token. Cannot create a free native request. Transfer the existing output, then complete_native_output; an upload failure does not authorize regeneration.",
      inputSchema: { generation_id: z.uuid(), execution_token: z.uuid() },
      annotations: { ...readOnly, readOnlyHint: false },
      _meta: meta,
    },
    async ({ generation_id, execution_token }) =>
      safely(() =>
        prepareNativeOutput(
          client,
          context.workspace.id,
          generation_id,
          execution_token,
        ),
      ),
  )
  server.registerTool(
    "report_native_outcome",
    {
      title: "Report native execution uncertainty",
      description:
        "Report an interrupted or failed claimed native attempt for operator reconciliation. Client reports do not automatically release credits. Do not generate another image or assume a refund. The same actual output can still be saved if recovered.",
      inputSchema: {
        generation_id: z.uuid(),
        execution_token: z.uuid(),
        detail: z.string().max(350),
      },
      annotations: { ...readOnly, readOnlyHint: false },
      _meta: meta,
    },
    async ({ generation_id, execution_token, detail }) =>
      safely(async () => {
        const result = await client.rpc("report_native_outcome", {
          target_generation: generation_id,
          expected_execution_token: execution_token,
          detail,
        })
        if (result.error) throw new Error(result.error.message)
        return getNativeSnapshot(client, context.workspace.id, generation_id)
      }),
  )
  registerAppTool(
    server,
    "complete_native_output",
    {
      title: "Open native image",
      description:
        "Validate and save an already-uploaded native image, then open CreativeOtter's Output/Inputs panel. Never invokes provider inference. A validated saved delivery atomically settles the reserved CreativeOtter credits. A successful file upload is not ready until this tool confirms saved output.",
      inputSchema: { generation_id: z.uuid(), execution_token: z.uuid() },
      outputSchema: generationSnapshotSchema.shape,
      annotations: { ...readOnly, readOnlyHint: false },
      _meta: {
        ...meta,
        ui: {
          resourceUri: GENERATION_RESOURCE_URI,
          visibility: ["model", "app"],
        },
        "openai/outputTemplate": GENERATION_RESOURCE_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Saving your native image…",
        "openai/toolInvocation/invoked": "Opened your native image",
      },
    },
    async ({ generation_id, execution_token }) =>
      attachPreviewAccess(
        await safely(() =>
          finishNativeOutput(
            client,
            context.workspace.id,
            generation_id,
            execution_token,
          ),
        ),
        previewAccessToken,
        context,
        client,
      ),
  )
  server.registerTool(
    "get_native_generation",
    {
      title: "Native image result",
      description:
        "Read an existing native generation and refresh its private preview/download links. Never starts generation or calls a paid provider.",
      inputSchema: { generation_id: z.uuid() },
      annotations: readOnly,
      _meta: {
        ...meta,
        ui: { visibility: ["model", "app"] },
        "openai/widgetAccessible": true,
      },
    },
    async ({ generation_id }) =>
      safely(() =>
        getNativeSnapshot(client, context.workspace.id, generation_id),
      ),
  )
}
