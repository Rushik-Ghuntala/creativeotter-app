import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export const ACCOUNT_RESOURCE_URI = "ui://creativeotter/account-v4.html"

export const registerAccountResource = (server: McpServer, appUrl: string) => {
  const ui = {
    prefersBorder: false,
    domain: appUrl,
    csp: { connectDomains: [], resourceDomains: [] },
  }
  registerAppResource(
    server,
    "CreativeOtter account",
    ACCOUNT_RESOURCE_URI,
    {
      description:
        "Your connected CreativeOtter account with overview, activity and settings.",
      _meta: { ui },
    },
    async () => ({
      contents: [
        {
          uri: ACCOUNT_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(
            join(process.cwd(), "src/lib/mcp/ui/dist/account.html"),
            "utf8",
          ),
          _meta: {
            ui,
            "openai/widgetDescription":
              "CreativeOtter account panel showing the authenticated account, workspace, current capability availability, activity and settings. The tabs are interactive; avoid repeating every visible row in prose.",
            "openai/widgetPrefersBorder": false,
            "openai/widgetDomain": appUrl,
            "openai/widgetCSP": {
              connect_domains: [],
              resource_domains: [],
              redirect_domains: [appUrl],
            },
          },
        },
      ],
    }),
  )
}
