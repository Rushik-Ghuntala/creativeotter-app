import { getCreditSummary } from "@/lib/credits/service"
import { registerNativeTools, NATIVE_TOOLS } from "@/lib/mcp/native-tools"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { registerMediaTools, MEDIA_TOOLS } from "@/lib/mcp/media-tools"
import { getMediaAccess } from "@/lib/media/service"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server"
import {
  accountSectionSchema,
  accountSnapshotSchema,
  createAccountSnapshot,
} from "@/lib/mcp/account"
import {
  ACCOUNT_RESOURCE_URI,
  registerAccountResource,
} from "@/lib/mcp/account-resource"
import type { McpContext } from "@/lib/database.types"

const productVersion = "0.4.0"

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}
const securitySchemes = [{ type: "oauth2", scopes: ["email"] }]

export const createCreativeOtterMcp = (
  context: McpContext,
  appUrl: string,
  email: string | null = null,
  client?: SupabaseClient<Database>,
) => {
  const server = new McpServer({
    name: "creativeotter",
    title: "CreativeOtter",
    version: productVersion,
  })
  registerAccountResource(server, appUrl)
  if (client) {
    registerMediaTools(server, client, context, appUrl)
    registerNativeTools(server, client, context)
  }
  server.registerTool(
    "get_capabilities",
    {
      title: "CreativeOtter capabilities",
      description:
        "Read CreativeOtter hybrid routing and backend capabilities. Native tool availability must be checked in the current host; a false provider generation flag does not disable native creation.",
      inputSchema: {},
      annotations: readOnly,
      _meta: { securitySchemes },
    },
    async () => {
      const access = client
        ? await getMediaAccess(client, context.workspace.id)
        : null
      const ready = Boolean(
        access?.enabled &&
        access.can_prepare &&
        access.provider_ready &&
        access.provider_budget_enabled &&
        access.credit_pricing_enabled,
      )
      const data = {
        product: "CreativeOtter",
        version: productVersion,
        workspace: context.workspace,
        permissions: context.permissions,
        enabled_tools: [
          "get_capabilities",
          "manage_account",
          ...(client
            ? ["resolve_generation_route", "list_models", "get_model_params"]
            : []),
          ...(access?.enabled && access.can_prepare
            ? [
                ...NATIVE_TOOLS,
                "create_upload_url",
                "complete_upload",
                "manage_assets",
              ]
            : []),
          ...(ready
            ? MEDIA_TOOLS.filter(
                (name) => !["list_models", "get_model_params"].includes(name),
              )
            : []),
        ],
        execution_policy: "native_first",
        native_generation: {
          availability: "inspect_host_tools",
          provider_key_required: false,
          instructions:
            "Use a suitable actual native host tool first. Native generation can proceed when the library connection is unavailable; saving then remains optional.",
        },
        provider_image_generation: ready,
        native_output_import: Boolean(access?.enabled && access.can_prepare),
        media_generation: ready,
        uploads: Boolean(access?.enabled && access.can_prepare),
        billing: false,
        credit_accounting: Boolean(client),
        credit_purchases: false,
        credit_units_per_display_credit: 1000,
        native_image_credit_units: "0",
        generation_mode: "review",
        default_models: {
          image: "native_if_suitable",
          provider_fallback: ready ? "image/nano-banana-2" : null,
        },
        setup_url: `${appUrl}/dashboard`,
        implemented_categories: ["image"],
        unavailable_categories: [
          "video",
          "speech",
          "music",
          "sound_effects",
          "editing",
        ],
        message: ready
          ? "Use suitable native tools first. A reviewed provider image fallback is available. Only image provider generation is implemented; other native workflows depend on host tools."
          : "Use suitable native host tools first; they do not require a CreativeOtter provider key. Saving native images requires media permissions. Provider fallback is currently unavailable; it needs provider configuration, workspace budget and direct approval.",
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: data,
      }
    },
  )
  registerAppTool(
    server,
    "manage_account",
    {
      title: "Manage account",
      description:
        "Show the interactive CreativeOtter account panel: connected email, workspace, overview, activity and settings. Use when the user checks their connection or account. Read-only; cannot purchase credits, change settings or approve paid work.",
      inputSchema: {
        section: accountSectionSchema.default("overview"),
      },
      outputSchema: accountSnapshotSchema.shape,
      annotations: readOnly,
      _meta: {
        securitySchemes,
        ui: { resourceUri: ACCOUNT_RESOURCE_URI, visibility: ["model", "app"] },
        "openai/outputTemplate": ACCOUNT_RESOURCE_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Opening your CreativeOtter account…",
        "openai/toolInvocation/invoked": "Opened your CreativeOtter account",
      },
    },
    async ({ section }) => {
      const data = createAccountSnapshot(context, appUrl, section, email)
      if (client) {
        data.balance = await getCreditSummary(client, context.workspace.id)
        if (data.balance) data.billing_status = "credits_ready"
        const access = await getMediaAccess(client, context.workspace.id)
        data.native_output_import = access.enabled && access.can_prepare
        data.uploads = data.native_output_import
        data.media_generation = Boolean(
          data.uploads &&
          access.provider_ready &&
          access.provider_budget_enabled &&
          access.credit_pricing_enabled,
        )
        if (access.can_read) {
          const [native, provider] = await Promise.all([
            client
              .from("native_generations")
              .select("id,reported_model,state,created_at")
              .eq("workspace_id", context.workspace.id)
              .order("created_at", { ascending: false })
              .limit(10),
            client
              .from("generation_jobs")
              .select("id,state,created_at")
              .eq("workspace_id", context.workspace.id)
              .order("created_at", { ascending: false })
              .limit(10),
          ])
          data.activity = [
            ...(native.data || []).map((row) => ({
              id: row.id,
              title: row.reported_model || "Native image",
              state: row.state,
              source: "native" as const,
              created_at: row.created_at,
            })),
            ...(provider.data || []).map((row) => ({
              id: row.id,
              title: "Nano Banana 2",
              state: row.state,
              source: "provider" as const,
              created_at: row.created_at,
            })),
          ]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 10)
        }
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: data,
      }
    },
  )
  return server
}
