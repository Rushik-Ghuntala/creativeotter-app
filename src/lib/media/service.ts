import "server-only"
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { getAppUrl } from "@/lib/env"
import { signAsset } from "@/lib/media/assets"
import { dispatchImageJob, reconcileImageJob } from "@/lib/media/worker"
import {
  IMAGE_MODEL,
  imageInputSchema,
  formatProviderEstimate,
  providerConfigured,
  type GenerationSnapshot,
  type ImageInput,
} from "@/lib/media/contracts"

export const getMediaAccess = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
) => {
  const { data, error } = await client.rpc("get_generation_access", {
    target_workspace: workspaceId,
  })
  if (error || !data)
    return {
      enabled: false,
      can_read: false,
      can_prepare: false,
      provider_budget_enabled: false,
      credit_pricing_enabled: false,
      native_credit_pricing_enabled: false,
      provider_ready: providerConfigured(),
    }
  return { ...data, provider_ready: providerConfigured() }
}

export const prepareImageQuote = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  value: ImageInput,
  key: string = randomUUID(),
) => {
  if (!providerConfigured())
    throw new Error(
      "Paid generation is disabled. An operator must explicitly enable paid services and configure the server provider before preparing a real request.",
    )
  const access = await getMediaAccess(client, workspaceId)
  if (
    !access.enabled ||
    !access.can_prepare ||
    !access.provider_budget_enabled ||
    !access.credit_pricing_enabled
  )
    throw new Error(
      "Provider fallback requires media access, configured credit pricing and an operator-configured provider budget. Native CreativeOtter work also requires its own priced quote and sufficient credits.",
    )
  const input = imageInputSchema.parse(value)
  const { data, error } = await client.rpc("prepare_image_quote", {
    target_workspace: workspaceId,
    quote_input: input,
    request_key: key,
  })
  if (error || !data)
    throw new Error(error?.message || "Unable to prepare the generation quote")
  return data
}

export const startImageGeneration = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  quoteId: string,
): Promise<GenerationSnapshot> => {
  if (!providerConfigured())
    throw new Error("The image provider is not configured")
  const result = await client.rpc("start_image_generation", {
    target_quote: quoteId,
  })
  if (result.error || !result.data)
    throw new Error(result.error?.message || "Unable to start this image")
  // The database's one-use job claim prevents duplicate provider submissions.
  await dispatchImageJob(result.data.id)
  return getGenerationSnapshot(client, workspaceId, quoteId)
}

export const getGenerationSnapshot = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
  quoteId: string,
  refresh = true,
): Promise<GenerationSnapshot> => {
  const { data: quote, error } = await client
    .from("generation_quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("workspace_id", workspaceId)
    .single()
  if (error || !quote)
    throw new Error(
      "This generation is unavailable or belongs to another workspace",
    )
  let { data: job } = await client
    .from("generation_jobs")
    .select("*")
    .eq("quote_id", quote.id)
    .single()
  if (job && refresh) {
    await reconcileImageJob(job)
    const updated = await client
      .from("generation_jobs")
      .select("*")
      .eq("id", job.id)
      .single()
    job = updated.data || job
  }
  const input = imageInputSchema.parse(quote.input)
  const ids = [
    ...input.reference_asset_ids,
    ...(job?.output_asset_id ? [job.output_asset_id] : []),
  ]
  const rows = ids.length
    ? await client
        .from("media_assets")
        .select("*")
        .in("id", ids)
        .eq("workspace_id", workspaceId)
        .eq("status", "ready")
    : { data: [] }
  const assets = await Promise.all(
    (rows.data || []).map((asset) => signAsset(client, asset)),
  )
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
