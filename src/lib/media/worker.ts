import "server-only"
import { createHash } from "node:crypto"
import { validateImageBytes } from "@/lib/media/image-validation"
import { createAdminSupabase } from "@/lib/supabase"
import {
  MEDIA_BUCKET,
  imageInputSchema,
  type ImageJob,
} from "@/lib/media/contracts"
import {
  createFalImageProvider,
  ProviderSubmissionError,
  type ProviderReceipt,
} from "@/lib/media/provider"

const provider = () => {
  if (!process.env.FAL_KEY)
    throw new Error("The generation provider is not configured")
  return createFalImageProvider(process.env.FAL_KEY)
}
const markFailure = async (
  id: string,
  state: "failed" | "needs_reconciliation" | "save_failed",
  message: string,
) => {
  const result = await createAdminSupabase().rpc("mark_image_job_failure", {
    target_job: id,
    next_state: state,
    safe_message: message,
  })
  if (result.error) throw new Error("Unable to record generation state")
}

export const dispatchImageJob = async (jobId: string) => {
  const api = provider()
  const admin = createAdminSupabase()
  const claimed = await admin.rpc("claim_image_job", { target_job: jobId })
  if (claimed.error) throw new Error("Unable to claim the approved generation")
  if (!claimed.data) return
  const job = claimed.data
  const leaseId = job.lease_id
  if (!leaseId) {
    await markFailure(
      job.id,
      "needs_reconciliation",
      "Job claim is incomplete. Operator review is required.",
    )
    return
  }
  let references: string[] = []
  let input
  try {
    input = imageInputSchema.parse(job.input)
    references = await Promise.all(
      input.reference_asset_ids.map(async (id) => {
        const { data: asset } = await admin
          .from("media_assets")
          .select("*")
          .eq("id", id)
          .eq("workspace_id", job.workspace_id)
          .eq("status", "ready")
          .single()
        if (!asset)
          throw new Error("A reviewed reference is no longer available")
        const signed = await admin.storage
          .from(MEDIA_BUCKET)
          .createSignedUrl(asset.storage_path, 3600)
        if (signed.error || !signed.data)
          throw new Error("Unable to prepare reviewed references")
        return signed.data.signedUrl
      }),
    )
  } catch {
    await markFailure(
      job.id,
      "failed",
      "A reviewed input is unavailable. Create a fresh quote after checking your references.",
    )
    return
  }
  try {
    const receipt = await api.submit(input, references)
    const saved = await admin
      .from("generation_jobs")
      .update({
        state: "submitted",
        provider_request_id: receipt.requestId,
        provider_status_url: receipt.statusUrl,
        provider_result_url: receipt.resultUrl,
        public_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("lease_id", leaseId)
      .in("state", ["submitting", "needs_reconciliation"])
      .select("id")
      .maybeSingle()
    if (saved.error || !saved.data)
      await markFailure(
        job.id,
        "needs_reconciliation",
        "The provider accepted this request, but its tracking receipt could not be saved. Operator reconciliation is required; do not regenerate.",
      )
  } catch (error) {
    await markFailure(
      job.id,
      error instanceof ProviderSubmissionError && error.rejected
        ? "failed"
        : "needs_reconciliation",
      error instanceof ProviderSubmissionError
        ? error.message
        : "Submission outcome needs operator reconciliation. This request will not be submitted again automatically.",
    )
  }
}

const downloadOutput = async (url: string) => {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  })
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length") || 0) > 31457280
  )
    throw new Error("Unable to save provider output")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > 31457280) {
      await reader.cancel()
      throw new Error("Provider output exceeds the storage limit")
    }
    chunks.push(value)
  }
  const buffer = Buffer.concat(chunks)
  validateImageBytes(buffer, "image/png", 31457280)
  return buffer
}

export const reconcileImageJob = async (job: ImageJob) => {
  if (!process.env.FAL_KEY || ["succeeded", "failed"].includes(job.state))
    return
  if (job.state === "queued") {
    await dispatchImageJob(job.id)
    return
  }
  if (
    job.state === "submitting" &&
    job.lease_until &&
    new Date(job.lease_until).getTime() < Date.now()
  ) {
    await markFailure(
      job.id,
      "needs_reconciliation",
      "Submission was interrupted. Operator reconciliation is required before another request can be made.",
    )
    return
  }
  if (
    !job.provider_request_id ||
    !job.provider_status_url ||
    !job.provider_result_url
  )
    return
  const receipt: ProviderReceipt = {
    requestId: job.provider_request_id,
    statusUrl: job.provider_status_url,
    resultUrl: job.provider_result_url,
  }
  const api = provider()
  let status
  try {
    status = await api.status(receipt)
  } catch {
    return
  }
  if (status !== "COMPLETED") return
  const admin = createAdminSupabase()
  try {
    const output = await api.result(receipt)
    await admin
      .from("generation_jobs")
      .update({ state: "saving", updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .neq("state", "succeeded")
    const bytes = await downloadOutput(output.url)
    const path = `${job.workspace_id}/outputs/${job.id}.png`
    const upload = await admin.storage
      .from(MEDIA_BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: false })
    if (
      upload.error &&
      !["409", "Duplicate"].includes(String(upload.error.statusCode)) &&
      !upload.error.message.toLowerCase().includes("already exists")
    )
      throw new Error("Output storage is unavailable")
    const finished = await admin.rpc("complete_image_job", {
      target_job: job.id,
      asset_metadata: {
        size_bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        ...validateImageBytes(bytes, "image/png", 31457280),
      },
    })
    if (finished.error) throw new Error("Unable to finalize the saved image")
  } catch {
    await markFailure(
      job.id,
      "save_failed",
      "The provider result is not saved yet. Refresh to retry saving the same result; a new generation will not be submitted.",
    )
  }
}
