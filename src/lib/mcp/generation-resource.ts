import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getPublicEnv } from "@/lib/env"

export const GENERATION_RESOURCE_URI = "ui://creativeotter/generation-v2.html"
export const registerGenerationResource = (
  server: McpServer,
  appUrl: string,
) => {
  const storageOrigin = new URL(getPublicEnv().url).origin
  const ui = {
    prefersBorder: false,
    domain: appUrl,
    csp: { connectDomains: [], resourceDomains: [storageOrigin] },
  }
  registerAppResource(
    server,
    "CreativeOtter image",
    GENERATION_RESOURCE_URI,
    { _meta: { ui } },
    async () => ({
      contents: [
        {
          uri: GENERATION_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(
            join(process.cwd(), "src/lib/mcp/ui/dist/generation.html"),
            "utf8",
          ),
          _meta: {
            ui,
            "openai/widgetDescription":
              "CreativeOtter image generation with live status, exact inputs, private reference previews, saved output and download. The widget does not approve charges. Keep prose brief and describe the actual state; do not say ready before a saved output exists.",
            "openai/widgetPrefersBorder": false,
            "openai/widgetDomain": appUrl,
            "openai/widgetCSP": {
              connect_domains: [],
              resource_domains: [storageOrigin],
              redirect_domains: [appUrl, storageOrigin],
            },
          },
        },
      ],
    }),
  )
}
