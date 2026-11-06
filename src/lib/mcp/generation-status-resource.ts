import "server-only"
import { attachPreviewAccess } from "@/lib/mcp/preview-access"
import { z } from "zod"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, McpContext } from "@/lib/database.types"
import { readExistingGenerationStatus } from "@/lib/media/status"

export const registerGenerationStatusResource = (
  server: McpServer,
  client: SupabaseClient<Database>,
  context: McpContext,
  previewAccessToken?: string,
) => {
  server.registerResource(
    "CreativeOtter existing image status",
    new ResourceTemplate("creativeotter://generation/{source}/{id}", {
      list: undefined,
    }),
    {
      mimeType: "application/json",
      description:
        "Read or reconcile one existing image in the authorized workspace. Never creates a quote, generation or reservation.",
    },
    async (uri, variables) => {
      const source = z.enum(["native", "provider"]).parse(variables.source)
      const id = z.uuid().parse(variables.id)
      const snapshot = await readExistingGenerationStatus(
        client,
        context.workspace.id,
        {
          execution_source: source,
          generation_id: id,
        },
      )
      const result = await attachPreviewAccess(
        { content: [], structuredContent: snapshot } as CallToolResult,
        previewAccessToken,
        context,
        client,
      )
      return {
        _meta: result._meta,
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(snapshot),
          },
        ],
      }
    },
  )
}
