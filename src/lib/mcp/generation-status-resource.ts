import "server-only"
import { z } from "zod"
import {
  ResourceTemplate,
  type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, McpContext } from "@/lib/database.types"
import { getMediaAccess, getGenerationSnapshot } from "@/lib/media/service"
import { getNativeSnapshot } from "@/lib/media/native"

export const registerGenerationStatusResource = (
  server: McpServer,
  client: SupabaseClient<Database>,
  context: McpContext,
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
      const access = await getMediaAccess(client, context.workspace.id)
      if (!access.enabled || !access.can_read)
        throw new Error("Media access is not enabled for this connection")
      let snapshot
      if (source === "native")
        snapshot = await getNativeSnapshot(client, context.workspace.id, id)
      else {
        snapshot = await getGenerationSnapshot(
          client,
          context.workspace.id,
          id,
          false,
        )
        // A refresh must never dispatch a queued job or create a new request.
        if (
          ["submitted", "submitting", "saving", "save_failed"].includes(
            snapshot.state,
          )
        )
          snapshot = await getGenerationSnapshot(
            client,
            context.workspace.id,
            id,
          )
      }
      return {
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
