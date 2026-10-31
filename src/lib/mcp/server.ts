import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { McpContext } from "@/lib/database.types"

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}
const securitySchemes = [{ type: "oauth2", scopes: ["email"] }]

export const createCreativeOtterMcp = (context: McpContext, appUrl: string) => {
  const server = new McpServer({ name: "creativeotter", version: "0.1.0" })
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
        version: "0.1.0",
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
  server.registerTool(
    "manage_account",
    {
      title: "CreativeOtter account",
      description:
        "Read your authorized CreativeOtter workspace or integration settings. Does not purchase credits, change settings or approve paid requests. Billing activity is not implemented yet.",
      inputSchema: {
        section: z
          .enum(["overview", "settings", "activity"])
          .default("overview"),
      },
      annotations: readOnly,
      _meta: { securitySchemes },
    },
    async ({ section }) => {
      const data = {
        section,
        user_id: context.user_id,
        client_id: context.client_id,
        workspace: context.workspace,
        role: context.role,
        permissions: context.permissions,
        account_url: `${appUrl}/dashboard`,
        balance: null,
        billing_status: "not_implemented",
        generation_mode: "review",
        message:
          section === "activity"
            ? "No billing ledger has been implemented; no charge or refund history is available."
            : "Connected to your CreativeOtter workspace with read-only account access.",
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
        structuredContent: data,
      }
    },
  )
  return server
}
