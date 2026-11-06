import "server-only"
import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { MEDIA_BUCKET } from "@/lib/media/contracts"
import { validateImageBytes } from "@/lib/media/image-validation"
import {
  archiveProjectFiles,
  motionAssetsSchema,
  readProjectZip,
  validProjectPath,
  type MotionAsset,
} from "@/lib/render/project"

export const bundleMotionAssets = async (
  client: SupabaseClient<Database>,
  workspace: string,
  zip: Uint8Array,
  attachments: MotionAsset[],
) => {
  const assets = motionAssetsSchema.parse(attachments)
  if (!assets.length) return zip
  const files = readProjectZip(zip)
  const names = new Set(Object.keys(files).map((name) => name.toLowerCase()))
  let size = Object.values(files).reduce(
    (total, bytes) => total + bytes.length,
    0,
  )
  // Validate every destination before any private storage access.
  for (const asset of assets) {
    validProjectPath(asset.path)
    if (!/^assets\/.+\.(png|jpe?g|webp)$/i.test(asset.path))
      throw new Error("Put saved artwork in assets/ as PNG, JPEG or WebP.")
    if (names.has(asset.path.toLowerCase()))
      throw new Error("Choose an unused file name for each saved image.")
    names.add(asset.path.toLowerCase())
  }
  for (const attachment of assets) {
    const { data: asset, error } = await client
      .from("media_assets")
      .select("*")
      .eq("id", attachment.asset_id)
      .eq("workspace_id", workspace)
      .eq("status", "ready")
      .single()
    if (error || !asset || !asset.size_bytes || asset.size_bytes > 12582912)
      throw new Error("This saved artwork isn’t available to your workspace.")
    const extension = attachment.path.split(".").at(-1)!.toLowerCase()
    const mime =
      extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : `image/${extension}`
    if (mime !== asset.mime_type)
      throw new Error("The artwork file extension must match its image type.")
    const result = await client.storage
      .from(MEDIA_BUCKET)
      .download(asset.storage_path)
    if (result.error || !result.data || result.data.size !== asset.size_bytes)
      throw new Error("We couldn’t read this saved artwork.")
    const bytes = new Uint8Array(await result.data.arrayBuffer())
    validateImageBytes(bytes, asset.mime_type)
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
      throw new Error("This saved artwork could not be verified.")
    size += bytes.length
    if (size > 64 * 1024 * 1024)
      throw new Error("This project expands to more than 64 MB.")
    files[attachment.path] = bytes
  }
  const bundled = archiveProjectFiles(files)
  readProjectZip(bundled)
  return bundled
}
