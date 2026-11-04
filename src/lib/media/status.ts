import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { getMediaAccess, getGenerationSnapshot } from "@/lib/media/service"
import { getNativeSnapshot } from "@/lib/media/native"
import type { z } from "zod"
import { previewReferenceSchema } from "@/lib/mcp/preview-access-contracts"

export const readExistingGenerationStatus = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  reference: z.infer<typeof previewReferenceSchema>,
) => {
  const access = await getMediaAccess(client, workspaceId)
  if (!access.enabled || !access.can_read)
    throw new Error("Media access is not enabled for this connection")
  if (reference.execution_source === "native")
    return getNativeSnapshot(client, workspaceId, reference.generation_id)
  let snapshot = await getGenerationSnapshot(
    client,
    workspaceId,
    reference.generation_id,
    false,
  )
  // Only reconcile an already-submitted request. Never dispatch a queued job.
  if (
    ["submitted", "submitting", "saving", "save_failed"].includes(
      snapshot.state,
    )
  )
    snapshot = await getGenerationSnapshot(
      client,
      workspaceId,
      reference.generation_id,
    )
  return snapshot
}
