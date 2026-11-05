import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/database.types"
import type { ImageQuote, MediaAsset } from "@/lib/media/contracts"
import { generationSnapshotSchema } from "@/lib/media/contracts"
import { signAssets } from "@/lib/media/assets"
import {
  buildNativeSnapshot,
  buildProviderSnapshot,
  type PreviewNative,
  type PreviewJob,
} from "@/lib/media/snapshot-builders"
import { getAppUrl, getPublicEnv } from "@/lib/env"
import type {
  PreviewAccess,
  PreviewReference,
} from "@/lib/mcp/preview-access-contracts"

export const isSavedPreviewToken = (token: string) =>
  /^sp1\.[A-Za-z0-9_-]{43}$/.test(token)
export const createSavedPreviewAccess = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  generations: PreviewReference[],
): Promise<PreviewAccess> => {
  const token = `sp1.${randomBytes(32).toString("base64url")}`
  const { data, error } = await client.rpc("create_saved_preview", {
    target_workspace: workspaceId,
    secret_hash: createHash("sha256").update(token).digest("hex"),
    generations: generations as Json,
  })
  if (error || !data) throw new Error("Unable to authorize saved image refresh")
  return { url: `${getAppUrl()}/api/preview/status`, token, expires_at: null }
}

type SavedRows = {
  native: PreviewNative | null
  quote: ImageQuote | null
  job: PreviewJob | null
  assets: MediaAsset[]
}
export const readSavedPreview = async (
  token: string,
  reference: PreviewReference,
) => {
  const env = getPublicEnv()
  // A public-key client. The opaque capability is checked by the read-only RPC
  // and Storage RLS against the current workspace connection on EVERY request.
  const client = createClient<Database>(env.url, env.key, {
    global: { headers: { "x-creativeotter-preview": token } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.rpc("read_saved_preview", {
    preview_secret: token,
    ...reference,
  })
  if (error || !data)
    throw new Error(
      "Saved image permission was removed or the image is unavailable",
    )
  const rows = data as unknown as SavedRows
  const assets = await signAssets(client, rows.assets)
  const snapshot =
    reference.execution_source === "native" && rows.native
      ? buildNativeSnapshot(rows.native, assets)
      : rows.quote && rows.job
        ? buildProviderSnapshot(rows.quote, rows.job, assets)
        : null
  const parsed = generationSnapshotSchema.parse(snapshot)
  if (
    parsed.generation_id !== reference.generation_id ||
    parsed.execution_source !== reference.execution_source ||
    parsed.state !== "succeeded"
  )
    throw new Error("Saved image mismatch")
  return parsed
}
