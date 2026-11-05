import { attachPreviewAccess } from "@/lib/mcp/preview-access"
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, McpContext } from "@/lib/database.types"
import { getImageGallery } from "@/lib/media/gallery"
import {
  galleryRequestSchema,
  gallerySnapshotSchema,
} from "@/lib/media/gallery-contracts"
import { GENERATION_RESOURCE_URI } from "@/lib/mcp/generation-resource"

export const registerGalleryTools = (
  server: McpServer,
  client: SupabaseClient<Database>,
  context: McpContext,
  previewAccessToken?: string,
) => {
  registerAppTool(
    server,
    "show_image_gallery",
    {
      title: "Open CreativeOtter image gallery",
      description:
        "Show existing saved images together in one CreativeOtter-branded embedded gallery, in the supplied order. Use after completing a carousel, campaign or multiple images, and whenever the user asks to see saved slides together. Pass each returned generation_id and execution_source; provider IDs are quote IDs. This read-only tool never generates, reserves or charges credits. Do not substitute a host Canvas, raw image list or generic gallery when this viewer is available.",
      inputSchema: {
        title: galleryRequestSchema.shape.title,
        generations: galleryRequestSchema.shape.generations,
      },
      outputSchema: gallerySnapshotSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        securitySchemes: [{ type: "oauth2", scopes: ["email"] }],
        ui: {
          resourceUri: GENERATION_RESOURCE_URI,
          visibility: ["model", "app"],
        },
        "openai/outputTemplate": GENERATION_RESOURCE_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Opening your CreativeOtter gallery…",
        "openai/toolInvocation/invoked": "Opened your CreativeOtter gallery",
      },
    },
    async (args) => {
      try {
        const data = await getImageGallery(client, context.workspace.id, args)
        return attachPreviewAccess(
          {
            content: [{ type: "text" as const, text: JSON.stringify(data) }],
            structuredContent: data,
          },
          previewAccessToken,
          context,
          client,
        )
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                error instanceof Error
                  ? error.message
                  : "Unable to open these saved images",
            },
          ],
        }
      }
    },
  )
}
