import "server-only"
import { buildProviderSnapshot } from "@/lib/media/snapshot-builders"
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { signAsset } from "@/lib/media/assets"
import { dispatchImageJob, reconcileImageJob } from "@/lib/media/worker"
import {
  imageInputSchema,
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
  return buildProviderSnapshot(quote, job, assets)
}
