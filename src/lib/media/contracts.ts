import { z } from "zod"

export const IMAGE_MODEL = "image/nano-banana-2"
export const MEDIA_BUCKET = "creativeotter-media"
export const imageInputSchema = z
  .object({
    prompt: z.string().trim().min(1).max(8000),
    aspect_ratio: z.enum(["1:1", "4:5", "16:9", "9:16"]).default("4:5"),
    resolution: z.literal("1K").default("1K"),
    reference_asset_ids: z.array(z.uuid()).max(14).default([]),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.reference_asset_ids).size ===
      input.reference_asset_ids.length,
    "Reference assets must be distinct",
  )
export type ImageInput = z.infer<typeof imageInputSchema>
export type GenerationAccess = {
  enabled: boolean
  can_read: boolean
  can_prepare: boolean
  provider_budget_enabled: boolean
  credit_pricing_enabled: boolean
  native_credit_pricing_enabled: boolean
}
export type MediaAsset = {
  id: string
  workspace_id: string
  user_id: string
  kind: "reference" | "output"
  status: "pending" | "ready" | "rejected"
  storage_path: string
  label: string
  mime_type: "image/png" | "image/jpeg" | "image/webp"
  size_bytes: number | null
  sha256: string | null
  width: number | null
  height: number | null
  favorite: boolean
  created_at: string
}
export type ImageQuote = {
  credit_units: number | null
  credit_pricing_version: string | null
  id: string
  workspace_id: string
  user_id: string
  client_id: string
  idempotency_key: string
  model_key: string
  pricing_version: string
  input: ImageInput
  max_cost_micro_usd: number
  expires_at: string
  approved_at: string | null
  created_at: string
}
export const jobStateSchema = z.enum([
  "queued",
  "submitting",
  "submitted",
  "saving",
  "succeeded",
  "failed",
  "needs_reconciliation",
  "save_failed",
])
export type ImageJob = {
  credit_units: number | null
  credit_status: "unpriced" | "reserved" | "charged" | "released"
  id: string
  quote_id: string
  workspace_id: string
  user_id: string
  state: z.infer<typeof jobStateSchema>
  provider_request_id: string | null
  provider_status_url: string | null
  provider_result_url: string | null
  output_asset_id: string | null
  max_cost_micro_usd: number
  public_error: string | null
  lease_id: string | null
  lease_until: string | null
  created_at: string
  updated_at: string
}
export const displayAssetSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  url: z.url(),
  download_url: z.url(),
  mime_type: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  favorite: z.boolean(),
})
export const nativeHostSchema = z.enum(["codex", "chatgpt", "claude", "other"])
export type NativeHost = z.infer<typeof nativeHostSchema>
export const nativeInputSchema = z
  .object({
    prompt: z.string().trim().min(1).max(8000),
    aspect_ratio: z.string().max(32).nullable().default(null),
    resolution: z.string().max(32).nullable().default(null),
    reference_asset_ids: z.array(z.uuid()).max(14).default([]),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.reference_asset_ids).size ===
      input.reference_asset_ids.length,
    "References must be distinct",
  )
export type NativeInput = z.infer<typeof nativeInputSchema>
export type NativeGeneration = {
  id: string
  workspace_id: string
  user_id: string
  client_id: string
  request_key: string
  input: NativeInput
  host_name: NativeHost
  reported_model: string | null
  asset_id: string
  state:
    | "awaiting_approval"
    | "awaiting_generation"
    | "generating"
    | "awaiting_upload"
    | "succeeded"
    | "rejected"
    | "needs_reconciliation"
    | "failed"
    | "cancelled"
  credit_units: number | null
  credit_pricing_version: string | null
  credit_status:
    | "legacy_no_charge"
    | "quoted"
    | "reserved"
    | "charged"
    | "released"
    | "not_charged"
  expires_at: string | null
  approved_at: string | null
  execution_token: string | null
  claimed_at: string | null
  public_error: string | null
  created_at: string
}
export const generationSnapshotSchema = z.object({
  generation_id: z.uuid(),
  execution_source: z.enum(["native", "provider"]),
  quote_id: z.uuid().nullable(),
  job_id: z.uuid().nullable(),
  model: z.string(),
  model_name: z.string(),
  host_name: nativeHostSchema.nullable(),
  state: z.union([
    z.literal("awaiting_approval"),
    z.literal("awaiting_upload"),
    z.literal("expired"),
    z.literal("awaiting_generation"),
    z.literal("generating"),
    z.literal("cancelled"),
    jobStateSchema,
  ]),
  input: nativeInputSchema,
  max_cost_micro_usd: z.string().nullable(),
  credit_units: z.string().regex(/^\d+$/).nullable().default(null),
  credit_status: z
    .enum([
      "quoted",
      "unpriced",
      "reserved",
      "charged",
      "released",
      "legacy_no_charge",
      "not_charged",
    ])
    .nullable()
    .default(null),
  credit_pricing_version: z.string().nullable().default(null),
  estimated_cost_label: z.string(),
  pricing_version: z.string().nullable(),
  expires_at: z.string().nullable(),
  review_url: z.url().nullable(),
  job_url: z.url().nullable(),
  references: z.array(displayAssetSchema),
  outputs: z.array(displayAssetSchema),
  error: z.string().nullable(),
  message: z.string(),
})
export type GenerationSnapshot = z.infer<typeof generationSnapshotSchema>
export type DisplayAsset = z.infer<typeof displayAssetSchema>
export const formatProviderEstimate = (microUsd: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 3,
  }).format(microUsd / 1000000)
export const providerConfigured = () =>
  Boolean(
    process.env.CREATIVEOTTER_PAID_SERVICES_ENABLED === "true" &&
    process.env.FAL_KEY?.trim(),
  )
export const imageSignatureMatches = (bytes: Uint8Array, mime: string) => {
  const b = bytes
  if (mime === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => b[i] === value)
  if (mime === "image/jpeg") return b[0] === 255 && b[1] === 216 && b[2] === 255
  return (
    mime === "image/webp" &&
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  )
}
