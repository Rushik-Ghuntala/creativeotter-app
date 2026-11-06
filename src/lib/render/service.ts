import "server-only"
import { randomUUID, randomBytes, createHash } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { getAppUrl, getPublicEnv } from "@/lib/env"
import {
  RENDER_BUCKET,
  renderingEnabled,
  type RenderInput,
  type RenderJob,
  type RenderSnapshot,
} from "@/lib/render/contracts"
import { validateRenderInput } from "@/lib/render/sanitize"

type Client = SupabaseClient<Database>
export const getRenderAccess = async (client: Client, workspace: string) => {
  if (!renderingEnabled())
    return { available: false, png_credit_units: null, mp4_credit_units: null }
  const result = await client.rpc("get_render_access", {
    target_workspace: workspace,
  })
  if (result.error || !result.data)
    return { available: false, png_credit_units: null, mp4_credit_units: null }
  return {
    ...result.data,
    available:
      result.data.available &&
      Boolean(result.data.png_credit_units || result.data.mp4_credit_units),
  }
}
export const prepareRender = async (
  client: Client,
  workspace: string,
  input: RenderInput,
  requestKey: string = randomUUID(),
) => {
  if (!renderingEnabled())
    throw new Error("Design rendering is not available yet.")
  const checked = validateRenderInput(input)
  const { data, error } = await client.rpc("prepare_render", {
    target_workspace: workspace,
    render_input: checked,
    request_key: requestKey,
  })
  if (error || !data)
    throw new Error(error?.message || "We couldn’t prepare this design.")
  return data
}
export const startRender = async (client: Client, id: string) => {
  if (!renderingEnabled())
    throw new Error("Design rendering is not available yet.")
  const { data, error } = await client.rpc("start_render", {
    target_render: id,
  })
  if (error || !data)
    throw new Error(error?.message || "We couldn’t start this design.")
  return data
}
export const buildRenderSnapshot = async (
  client: Client,
  job: RenderJob,
): Promise<RenderSnapshot> => {
  let preview: string | null = null,
    download: string | null = null
  if (job.state === "succeeded" && job.storage_path) {
    const result = await client.storage
      .from(RENDER_BUCKET)
      .createSignedUrl(job.storage_path, 3600)
    if (result.error || !result.data)
      throw new Error("We couldn’t open this saved design.")
    preview = result.data.signedUrl
    const url = new URL(preview)
    url.searchParams.set(
      "download",
      `${job.input.title.replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 60) || "creativeotter"}.${job.input.format}`,
    )
    download = url.href
  }
  return {
    render_id: job.id,
    ...(job.input.revision_id
      ? {
          project_url: `${getAppUrl()}/studio/designs?project=${job.input.revision_id}`,
        }
      : {}),
    title: job.input.title,
    format: job.input.format,
    state: job.state,
    credit_units: String(job.credit_units),
    credit_status:
      job.state === "quoted"
        ? "quoted"
        : job.state === "succeeded"
          ? "charged"
          : job.state === "failed"
            ? "released"
            : "reserved",
    width: job.input.width,
    height: job.input.height,
    duration_seconds:
      job.input.format === "mp4" ? job.input.duration_seconds : 0,
    preview_url: preview,
    download_url: download,
    urls_expire_at: preview
      ? new Date(Date.now() + 3600000).toISOString()
      : null,
    saved: job.state === "succeeded",
    message:
      job.state === "succeeded"
        ? "Your design is ready and saved. You can preview and download it below."
        : job.state === "failed"
          ? "We couldn’t finish this design. Your reserved credits have been returned."
          : job.state === "quoted"
            ? "Your design estimate is ready. No credits have been spent."
            : "We’re rendering your design. It will appear here when it’s ready.",
  }
}
export const getRender = async (
  client: Client,
  workspace: string,
  id: string,
) => {
  const { data, error } = await client
    .from("render_jobs")
    .select("*")
    .eq("workspace_id", workspace)
    .eq("id", id)
    .single()
  if (error || !data)
    throw new Error("This saved design isn’t available to this account.")
  return buildRenderSnapshot(client, data)
}
export const createRenderPreview = async (client: Client, id: string) => {
  const token = `rp1.${randomBytes(32).toString("base64url")}`
  const { error } = await client.rpc("create_render_preview", {
    target_render: id,
    secret_hash: createHash("sha256").update(token).digest("hex"),
  })
  if (error) throw new Error("We couldn’t prepare this design preview.")
  return { url: `${getAppUrl()}/api/render/preview`, token }
}
export const readRenderPreview = async (token: string, id: string) => {
  const env = getPublicEnv()
  const client = createClient<Database>(env.url, env.key, {
    global: { headers: { "x-creativeotter-render": token } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.rpc("read_render_preview", {
    preview_secret: token,
    target_render: id,
  })
  if (error || !data) throw new Error("Access to this design was removed.")
  return buildRenderSnapshot(client, data)
}
