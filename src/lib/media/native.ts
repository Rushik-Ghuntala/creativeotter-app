import "server-only"
import { buildNativeSnapshot } from "@/lib/media/snapshot-builders"
import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { createAdminSupabase } from "@/lib/supabase"
import { getAppUrl } from "@/lib/env"
import { signAsset } from "@/lib/media/assets"
import { validateImageBytes } from "@/lib/media/image-validation"
import {
  MEDIA_BUCKET,
  nativeInputSchema,
  type NativeInput,
  type GenerationSnapshot,
  type NativeHost,
} from "@/lib/media/contracts"

export const prepareNativeGeneration = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  input: NativeInput,
  host: NativeHost,
  model: string | null,
  mime: string,
  key: string,
) => {
  const result = await client.rpc("prepare_native_generation", {
    target_workspace: workspaceId,
    request_key: key,
    native_input: nativeInputSchema.parse(input),
    host_name: host,
    reported_model: model,
    output_mime: mime,
  })
  if (result.error || !result.data)
    throw new Error(
      result.error?.message || "Unable to prepare the native generation quote",
    )
  return getNativeSnapshot(client, workspaceId, result.data.id)
}
export const prepareNativeOutput = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  generationId: string,
  token: string,
) => {
  const owned = await client
    .from("native_generations")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", generationId)
    .single()
  if (!owned.data) throw new Error("Native result access denied")
  const result = await client.rpc("authorize_native_upload", {
    target_generation: generationId,
    expected_execution_token: token,
  })
  if (result.error || !result.data)
    throw new Error(
      result.error?.message || "Native upload requires a paid execution claim",
    )
  const value = result.data
  if (value.state === "succeeded") return value
  if (!value.storage_path || !value.mime_type)
    throw new Error("Native upload metadata is unavailable")
  const signed = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(value.storage_path)
  if (signed.error || !signed.data)
    throw new Error("Unable to prepare native image upload")
  return {
    generation_id: value.generation_id,
    asset_id: value.asset_id,
    state: value.state,
    signed_url: signed.data.signedUrl,
    method: "PUT",
    content_type: value.mime_type,
    max_bytes: 12582912,
  }
}
export const finishNativeOutput = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  generationId: string,
  token: string,
) => {
  // Recheck the current user/client grant, reservation and execution token before trusted file access.
  const authorization = await client.rpc("authorize_native_upload", {
    target_generation: generationId,
    expected_execution_token: token,
  })
  if (authorization.error) throw new Error(authorization.error.message)
  const { data: native } = await client
    .from("native_generations")
    .select("*")
    .eq("id", generationId)
    .eq("workspace_id", workspaceId)
    .single()
  if (!native) throw new Error("Native result access denied")
  if (native.state === "succeeded")
    return getNativeSnapshot(client, workspaceId, generationId)
  const { data: asset } = await client
    .from("media_assets")
    .select("*")
    .eq("id", native.asset_id)
    .eq("workspace_id", workspaceId)
    .single()
  if (!asset || asset.kind !== "output" || asset.status !== "pending")
    throw new Error("Native output is unavailable")
  const admin = createAdminSupabase()
  const file = await admin.storage
    .from(MEDIA_BUCKET)
    .download(asset.storage_path)
  if (file.error || !file.data)
    throw new Error(
      "The native image has not been uploaded yet; save the existing result, do not regenerate",
    )
  const bytes = new Uint8Array(await file.data.arrayBuffer())
  const dimensions = validateImageBytes(bytes, asset.mime_type)
  const saved = await admin.rpc("complete_paid_native_output", {
    target_generation: generationId,
    expected_execution_token: token,
    asset_metadata: {
      ...dimensions,
      size_bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  })
  if (saved.error)
    throw new Error(
      "Unable to finalize the existing native image; its credit reservation remains held",
    )
  return getNativeSnapshot(client, workspaceId, generationId)
}
export const getNativeSnapshot = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  generationId: string,
): Promise<GenerationSnapshot> => {
  const { data: native, error } = await client
    .from("native_generations")
    .select("*")
    .eq("id", generationId)
    .eq("workspace_id", workspaceId)
    .single()
  if (error || !native)
    throw new Error(
      "Native generation is unavailable or belongs to another workspace",
    )
  const input = nativeInputSchema.parse(native.input)
  const { data: rows } = await client
    .from("media_assets")
    .select("*")
    .in("id", [...input.reference_asset_ids, native.asset_id])
    .eq("workspace_id", workspaceId)
    .eq("status", "ready")
  const assets = await Promise.all(
    (rows || []).map((asset) => signAsset(client, asset)),
  )
  return buildNativeSnapshot(native, assets)
}
