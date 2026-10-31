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

const productVersion = "0.2.0"

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
) => {
  const server = new McpServer({
    name: "creativeotter",
    title: "CreativeOtter",
    version: productVersion,
  })
  registerAccountResource(server, appUrl)
  server.registerTool(
    "get_capabilities",
    {
      title: "CreativeOtter capabilities",
      description:
        "Read the connected CreativeOtter workspace and enabled capabilities. This foundation supports account inspection; media generation is not enabled yet.",
      inputSchema: {},
      annotations: readOnly,
      _meta: { securitySchemes },
    },
    async () => {
      const data = {
        product: "CreativeOtter",
        version: productVersion,
        workspace: context.workspace,
        permissions: context.permissions,
        enabled_tools: ["get_capabilities", "manage_account"],
        media_generation: false,
        uploads: false,
        billing: false,
        generation_mode: "review",
        default_models: {},
        message:
          "Authentication is connected. Media generation, uploads and billing are not implemented yet.",
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
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: data,
      }
    },
  )
  return server
}
