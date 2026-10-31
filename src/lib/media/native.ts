import "server-only"
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

export const prepareNativeOutput = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  input: NativeInput,
  host: NativeHost,
  model: string | null,
  mime: string,
  key: string,
) => {
  const result = await client.rpc("prepare_native_output", {
    target_workspace: workspaceId,
    request_key: key,
    native_input: nativeInputSchema.parse(input),
    host_name: host,
    reported_model: model,
    output_mime: mime,
  })
  if (result.error || !result.data)
    throw new Error(
      result.error?.message || "Unable to save this native generation",
    )
  const generation = result.data
  if (generation.state === "succeeded")
    return {
      generation_id: generation.id,
      asset_id: generation.asset_id,
      state: generation.state,
    }
  if (generation.state !== "awaiting_upload")
    throw new Error(
      "This import was rejected. Upload the existing image as a fresh import; do not regenerate it.",
    )
  const signed = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(generation.storage_path)
  if (signed.error || !signed.data)
    throw new Error("Unable to prepare native output upload")
  return {
    generation_id: generation.id,
    asset_id: generation.asset_id,
    state: generation.state,
    signed_url: signed.data.signedUrl,
    method: "PUT",
    content_type: mime,
    max_bytes: 12582912,
  }
}

export const finishNativeOutput = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  generationId: string,
) => {
  const { data: native } = await client
    .from("native_generations")
    .select("*")
    .eq("id", generationId)
    .eq("workspace_id", workspaceId)
    .single()
  if (!native) throw new Error("Native result access denied")
  const access = await client.rpc("get_generation_access", {
    target_workspace: workspaceId,
  })
  if (!access.data?.can_prepare)
    throw new Error("Media preparation access is required")
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
    throw new Error("The native image has not been uploaded yet")
  const bytes = new Uint8Array(await file.data.arrayBuffer())
  const dimensions = validateImageBytes(bytes, asset.mime_type)
  const saved = await admin.rpc("complete_native_output", {
    target_generation: generationId,
    asset_metadata: {
      ...dimensions,
      size_bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  })
  if (saved.error)
    throw new Error(
      "Unable to finalize this native image; retry saving the existing output",
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
      "This native generation is unavailable or belongs to another workspace",
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
  const output = assets.filter((asset) => asset.id === native.asset_id)
  return {
    generation_id: native.id,
    execution_source: "native",
    quote_id: null,
    job_id: null,
    model: "native:image",
    model_name: native.reported_model || "Native image generation",
    host_name: native.host_name,
    state:
      native.state === "succeeded" && output.length
        ? "succeeded"
        : native.state === "rejected"
          ? "failed"
          : "awaiting_upload",
    input,
    max_cost_micro_usd: null,
    credit_units: "0",
    credit_status: "native_no_charge",
    credit_pricing_version: null,
    estimated_cost_label: "No CreativeOtter provider charge",
    pricing_version: null,
    expires_at: null,
    review_url: null,
    job_url: `${getAppUrl()}/studio/native/${native.id}`,
    references: input.reference_asset_ids.flatMap((id) =>
      assets.filter((asset) => asset.id === id),
    ),
    outputs: output,
    error: null,
    message:
      native.state === "succeeded" && output.length
        ? "Native assistant image saved in your private CreativeOtter library. Host usage limits may apply."
        : "Upload the image already produced by the native tool, then finalize this import. Do not generate another image to retry an upload.",
  }
}
