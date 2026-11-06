import { readFile } from "node:fs/promises"
import { join } from "node:path"
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { getPublicEnv } from "@/lib/env"

export const GENERATION_RESOURCE_URI = "ui://creativeotter/generation-v10.html"
export const registerGenerationResource = (
  server: McpServer,
  appUrl: string,
) => {
  const storageOrigin = new URL(getPublicEnv().url).origin
  const ui = {
    prefersBorder: false,
    domain: appUrl,
    csp: { connectDomains: [appUrl], resourceDomains: [storageOrigin] },
  }
  // Older conversations can retain these URIs in their tool descriptors.
  for (const uri of [
    GENERATION_RESOURCE_URI,
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(
      (version) => `ui://creativeotter/generation-v${version}.html`,
    ),
    "ui://creativeotter/generation.html",
  ]) {
    registerAppResource(
      server,
      `CreativeOtter image ${uri}`,
      uri,
      { _meta: { ui } },
      async () => ({
        contents: [
          {
            uri,
            mimeType: RESOURCE_MIME_TYPE,
            text: await readFile(
              join(process.cwd(), "src/lib/mcp/ui/dist/generation.html"),
              "utf8",
            ),
            _meta: {
              ui,
              "openai/widgetDescription":
                "CreativeOtter image generation with live status, exact inputs, private reference previews, saved output and download. Multiple saved images use a branded thumbnail gallery with per-image inputs, save and download. Opening a gallery does not generate or charge credits. The widget does not approve charges. Keep prose brief and describe the actual state; do not say ready before a saved output exists.",
              "openai/widgetPrefersBorder": false,
              "openai/widgetDomain": appUrl,
              "openai/widgetCSP": {
                connect_domains: [appUrl],
                resource_domains: [storageOrigin],
                redirect_domains: [appUrl, storageOrigin],
              },
            },
          },
        ],
      }),
    )
  }
}
