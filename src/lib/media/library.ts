import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { signAssets } from "@/lib/media/assets"
import type { MediaAsset } from "@/lib/media/contracts"

type LibraryOptions = {
  assetId?: string
  kind?: MediaAsset["kind"]
  limit: number
  requireAsset?: boolean
}

export const getLibraryAssets = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  options: LibraryOptions,
) => {
  if (options.requireAsset && !options.assetId)
    throw new Error("asset_id is required")
  let query = client
    .from("media_assets")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.limit)
  if (options.assetId) query = query.eq("id", options.assetId)
  if (options.kind) query = query.eq("kind", options.kind)
  const { data: assets, error } = await query
  if (error) throw new Error("Unable to open your library")
  if (!assets?.length) return []
  const outputIds = assets
    .filter((asset) => asset.kind === "output")
    .map((asset) => asset.id)
  const references = new Map<
    string,
    { generation_id: string; execution_source: "native" | "provider" }
  >()
  if (outputIds.length) {
    // Both lookups retain the caller's RLS, workspace and exact asset selection.
    const [native, provider] = await Promise.all([
      client
        .from("native_generations")
        .select("id,asset_id")
        .eq("workspace_id", workspaceId)
        .eq("state", "succeeded")
        .in("asset_id", outputIds),
      client
        .from("generation_jobs")
        .select("quote_id,output_asset_id")
        .eq("workspace_id", workspaceId)
        .eq("state", "succeeded")
        .in("output_asset_id", outputIds),
    ])
    if (native.error || provider.error)
      throw new Error("Unable to resolve your saved image previews")
    for (const item of native.data || [])
      references.set(item.asset_id, {
        generation_id: item.id,
        execution_source: "native",
      })
    for (const item of provider.data || []) {
      if (item.output_asset_id)
        references.set(item.output_asset_id, {
          generation_id: item.quote_id,
          execution_source: "provider",
        })
    }
  }
  const signed = await signAssets(client, assets)
  return signed.map((asset, index) => ({
    ...asset,
    kind: assets[index].kind,
    created_at: assets[index].created_at,
    gallery_reference: references.get(asset.id) || null,
  }))
}
