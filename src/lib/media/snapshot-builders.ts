import { getAppUrl } from "@/lib/env"
import {
  IMAGE_MODEL,
  nativeInputSchema,
  imageInputSchema,
  formatProviderEstimate,
  type NativeGeneration,
  type ImageQuote,
  type ImageJob,
  type DisplayAsset,
  type GenerationSnapshot,
} from "@/lib/media/contracts"
export type PreviewNative = Omit<NativeGeneration, "execution_token">
export type PreviewJob = Omit<
  ImageJob,
  | "provider_request_id"
  | "provider_status_url"
  | "provider_result_url"
  | "lease_id"
  | "lease_until"
>
export const buildNativeSnapshot = (
  native: PreviewNative,
  assets: DisplayAsset[],
): GenerationSnapshot => {
  const input = nativeInputSchema.parse(native.input)
  const outputs = assets.filter((asset) => asset.id === native.asset_id)
  const state =
    native.state === "awaiting_approval" &&
    native.expires_at &&
    new Date(native.expires_at).getTime() < Date.now()
      ? "expired"
      : native.state === "rejected"
        ? "failed"
        : native.state
  const message =
    state === "awaiting_approval"
      ? "Quote prepared without spending credits. For a requested image, the assistant can claim execution immediately; no browser approval is required."
      : state === "awaiting_generation"
        ? "Credits are reserved. Your assistant must claim this execution once before calling its native image tool."
        : state === "generating"
          ? "Native execution was claimed. Use this existing attempt; do not start another generation to retry saving."
          : state === "awaiting_upload"
            ? "Save the image from the claimed native execution. Credits remain reserved until validated delivery."
            : state === "succeeded"
              ? "Native image saved. The displayed billing record is authoritative; host usage limits may also apply."
              : state === "cancelled"
                ? "This unclaimed native request was cancelled. Any credit reservation was released."
                : state === "expired"
                  ? "This native quote expired before generation. No credits were reserved."
                  : state === "failed"
                    ? "Native failure was confirmed. Reserved credits were released."
                    : "The native outcome needs operator reconciliation. Credits remain reserved; do not regenerate or assume a refund."
  return {
    generation_id: native.id,
    execution_source: "native",
    quote_id: null,
    job_id: null,
    model: "native:image",
    model_name: native.reported_model || "Native image generation",
    host_name: native.host_name,
    state,
    input,
    max_cost_micro_usd: null,
    credit_units:
      native.credit_units === null ? "0" : String(native.credit_units),
    credit_status: native.credit_status,
    credit_pricing_version: native.credit_pricing_version,
    estimated_cost_label:
      "CreativeOtter credits apply; no backend provider inference",
    pricing_version: null,
    expires_at: native.expires_at,
    review_url: null,
    job_url: `${getAppUrl()}/studio/native/${native.id}`,
    references: input.reference_asset_ids.flatMap((id) =>
      assets.filter((asset) => asset.id === id),
    ),
    outputs: state === "succeeded" ? outputs : [],
    error: native.public_error,
    message,
  }
}

export const buildProviderSnapshot = (
  quote: ImageQuote,
  job: PreviewJob | null,
  assets: DisplayAsset[],
): GenerationSnapshot => {
  const input = imageInputSchema.parse(quote.input)
  const state =
    job?.state ||
    (new Date(quote.expires_at).getTime() < Date.now()
      ? "expired"
      : "awaiting_approval")
  return {
    generation_id: quote.id,
    execution_source: "provider",
    host_name: null,
    quote_id: quote.id,
    job_id: job?.id || null,
    model: IMAGE_MODEL,
    model_name: "Nano Banana 2",
    state,
    input,
    max_cost_micro_usd: String(quote.max_cost_micro_usd),
    credit_units:
      quote.credit_units === null ? null : String(quote.credit_units),
    credit_status: job?.credit_status || "quoted",
    credit_pricing_version: quote.credit_pricing_version,
    estimated_cost_label: formatProviderEstimate(quote.max_cost_micro_usd),
    pricing_version: quote.pricing_version,
    expires_at: quote.expires_at,
    review_url: `${getAppUrl()}/studio/review/${quote.id}`,
    job_url: job ? `${getAppUrl()}/studio/jobs/${job.id}` : null,
    references: input.reference_asset_ids.flatMap((id) =>
      assets.filter((asset) => asset.id === id),
    ),
    outputs: job?.output_asset_id
      ? assets.filter((asset) => asset.id === job.output_asset_id)
      : [],
    error: job?.public_error || null,
    message:
      state === "succeeded"
        ? "Image ready and saved in your private CreativeOtter library."
        : state === "awaiting_approval"
          ? "Quote prepared without spending credits. For a requested image, the assistant can call generate_image immediately; no browser approval is required."
          : state === "expired"
            ? "This quote expired before generation. Prepare a new quote; nothing was submitted for this quote."
            : "Check this existing request for progress. Do not submit a duplicate generation.",
  }
}
