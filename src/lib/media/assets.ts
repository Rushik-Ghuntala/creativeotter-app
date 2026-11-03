import { validateImageBytes } from "@/lib/media/image-validation"
import "server-only"
import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { createAdminSupabase } from "@/lib/supabase"
import {
  MEDIA_BUCKET,
  type MediaAsset,
  type DisplayAsset,
} from "@/lib/media/contracts"

// Batch private URL signing so a library page needs one Storage request.
export const signAssets = async (
  client: SupabaseClient<Database>,
  assets: MediaAsset[],
): Promise<DisplayAsset[]> => {
  if (!assets.length) return []
  const paths = [...new Set(assets.map((asset) => asset.storage_path))]
  const { data, error } = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, 3600)
  if (error || !data) throw new Error("Unable to open these private assets")
  const signed = new Map(data.map((item) => [item.path, item]))
  return assets.map((asset) => {
    const item = signed.get(asset.storage_path)
    if (item?.error || !item?.signedUrl)
      throw new Error("Unable to open this private asset")
    // The Storage SDK also adds download filenames as a query parameter.
    const download = new URL(item.signedUrl)
    const extension =
      asset.mime_type === "image/jpeg"
        ? "jpg"
        : asset.mime_type === "image/webp"
          ? "webp"
          : "png"
    download.searchParams.set(
      "download",
      `creativeotter-${asset.id}.${extension}`,
    )
    return {
      id: asset.id,
      label: asset.label,
      url: item.signedUrl,
      download_url: download.toString(),
      mime_type: asset.mime_type,
      width: asset.width,
      height: asset.height,
      favorite: asset.favorite,
    }
  })
}

export const signAsset = async (
  client: SupabaseClient<Database>,
  asset: MediaAsset,
): Promise<DisplayAsset> => (await signAssets(client, [asset]))[0]

export const beginMediaUpload = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  label: string,
  mime: string,
) => {
  const { data: asset, error } = await client.rpc("prepare_media_upload", {
    target_workspace: workspaceId,
    asset_label: label.slice(0, 160),
    asset_mime: mime,
  })
  if (error || !asset)
    throw new Error(
      "Upload access is unavailable. Enable media access for this workspace first.",
    )
  const signed = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(asset.storage_path)
  if (signed.error || !signed.data)
    throw new Error("Unable to prepare the private upload")
  return {
    asset_id: asset.id,
    path: asset.storage_path,
    token: signed.data.token,
    signed_url: signed.data.signedUrl,
  }
}

export const finishMediaUpload = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  assetId: string,
) => {
  const { data: asset } = await client
    .from("media_assets")
    .select("*")
    .eq("id", assetId)
    .eq("workspace_id", workspaceId)
    .single()
  if (!asset || asset.kind !== "reference")
    throw new Error("Reference asset access denied")
  const { data: access } = await client.rpc("get_generation_access", {
    target_workspace: workspaceId,
  })
  if (!access?.can_prepare)
    throw new Error("Media preparation permission is required")
  if (asset.status === "ready") return signAsset(client, asset)
  const admin = createAdminSupabase()
  const file = await admin.storage
    .from(MEDIA_BUCKET)
    .download(asset.storage_path)
  if (file.error || !file.data) throw new Error("Upload is not complete yet")
  const bytes = new Uint8Array(await file.data.arrayBuffer())
  let dimensions
  try {
    dimensions = validateImageBytes(bytes, asset.mime_type)
  } catch {
    await admin
      .from("media_assets")
      .update({ status: "rejected" })
      .eq("id", asset.id)
      .eq("status", "pending")
    throw new Error("Use a valid PNG, JPEG or WebP image smaller than 12 MB")
  }
  const result = await admin
    .from("media_assets")
    .update({
      status: "ready",
      ...dimensions,
      size_bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })
    .eq("id", asset.id)
    .eq("status", "pending")
    .select("*")
    .single()
  if (result.error || !result.data)
    throw new Error("Unable to finalize the reference upload")
  return signAsset(client, result.data)
}
