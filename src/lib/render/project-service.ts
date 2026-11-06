import "server-only"
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import {
  MOTION_SOURCE_BUCKET,
  readProjectZip,
  projectDigest,
  motionSettingsSchema,
  type MotionSettings,
} from "@/lib/render/project"
import { renderingEnabled } from "@/lib/render/contracts"
type Client = SupabaseClient<Database>
export const saveMotionRevision = async (
  client: Client,
  workspace: string,
  zip: Uint8Array,
  details: {
    title: string
    settings: MotionSettings
    parent_id?: string | null
    change_summary?: string
    request_key?: string
  },
) => {
  if (!renderingEnabled())
    throw new Error("Motion graphics are not available yet.")
  readProjectZip(zip)
  const settings = motionSettingsSchema.parse(details.settings)
  const result = await client.rpc("save_motion_revision", {
    target_workspace: workspace,
    title: details.title,
    settings,
    source_sha256: projectDigest(zip),
    source_bytes: zip.length,
    request_key: details.request_key || randomUUID(),
    parent_revision: details.parent_id || null,
    change_summary: details.change_summary || "",
  })
  if (result.error || !result.data)
    throw new Error(
      result.error?.message || "We couldn’t save this motion project.",
    )
  const revision = result.data
  const uploaded = await client.storage
    .from(MOTION_SOURCE_BUCKET)
    .upload(revision.source_path, zip, {
      contentType: "application/zip",
      upsert: false,
    })
  if (
    uploaded.error &&
    !["409", "Duplicate"].includes(uploaded.error.statusCode || "")
  )
    throw new Error("This project could not be saved. Please try again.")
  // The upload is immutable. A retry must match the exact archived bytes.
  const saved = await readMotionSource(client, workspace, revision.id)
  if (projectDigest(saved.zip) !== revision.source_sha256)
    throw new Error("The saved project could not be verified.")
  return revision
}
export const readMotionSource = async (
  client: Client,
  workspace: string,
  id: string,
) => {
  const { data: revision, error } = await client
    .from("motion_revisions")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspace)
    .single()
  if (error || !revision)
    throw new Error("This motion project isn’t available to your account.")
  const file = await client.storage
    .from(MOTION_SOURCE_BUCKET)
    .download(revision.source_path)
  if (file.error || !file.data)
    throw new Error("This project upload isn’t ready. Please try again.")
  const zip = new Uint8Array(await file.data.arrayBuffer())
  if (
    zip.length !== revision.source_bytes ||
    projectDigest(zip) !== revision.source_sha256
  )
    throw new Error("This project could not be verified.")
  return { revision, zip }
}
export const motionRenderInput = (
  revision: Awaited<ReturnType<typeof saveMotionRevision>>,
) => ({
  title: revision.title,
  format: "mp4" as const,
  html: "",
  css: "",
  asset_ids: [],
  engine: "hyperframes" as const,
  revision_id: revision.id,
  ...revision.settings,
})
export const beginMotionUpload = async (
  client: Client,
  workspace: string,
  details: {
    title: string
    settings: MotionSettings
    source_sha256: string
    source_bytes: number
    request_key: string
    parent_id?: string | null
    change_summary?: string
  },
) => {
  if (!renderingEnabled())
    throw new Error("Motion graphics are not available yet.")
  const result = await client.rpc("save_motion_revision", {
    target_workspace: workspace,
    title: details.title,
    settings: motionSettingsSchema.parse(details.settings),
    source_sha256: details.source_sha256,
    source_bytes: details.source_bytes,
    request_key: details.request_key,
    parent_revision: details.parent_id || null,
    change_summary: details.change_summary || "",
  })
  if (result.error || !result.data)
    throw new Error(
      result.error?.message || "We couldn’t prepare your project upload.",
    )
  const upload = await client.storage
    .from(MOTION_SOURCE_BUCKET)
    .createSignedUploadUrl(result.data.source_path, { upsert: false })
  if (upload.error || !upload.data)
    throw new Error("We couldn’t prepare your project upload.")
  return { revision: result.data, upload_url: upload.data.signedUrl }
}
