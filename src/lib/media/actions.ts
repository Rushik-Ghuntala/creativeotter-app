"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { getPersonalWorkspace, requireWebSession } from "@/lib/auth/session"
import { beginMediaUpload, finishMediaUpload } from "@/lib/media/assets"
import { providerConfigured } from "@/lib/media/contracts"
import { dispatchImageJob } from "@/lib/media/worker"

export const enableMediaAccess = async (form: FormData) => {
  const clientId = z.string().min(1).max(2048).parse(form.get("client_id"))
  const { supabase, user } = await requireWebSession()
  const { error } = await supabase
    .from("client_grants")
    .update({
      permissions: ["account:read", "media:read", "media:prepare"],
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("client_id", clientId)
    .is("revoked_at", null)
  if (error) throw new Error("Unable to enable media preparation")
  revalidatePath("/dashboard")
  redirect("/dashboard?notice=media_access_enabled")
}

export const approveImageGeneration = async (form: FormData) => {
  const id = z.uuid().parse(form.get("quote_id"))
  const { supabase } = await requireWebSession(`/studio/review/${id}`)
  if (!providerConfigured()) redirect(`/studio/review/${id}?error=provider`)
  const result = await supabase.rpc("approve_image_quote", { target_quote: id })
  if (result.error || !result.data)
    redirect(`/studio/review/${id}?error=approval`)
  await dispatchImageJob(result.data.id)
  redirect(`/studio/jobs/${result.data.id}`)
}

export const startReferenceUpload = async (form: FormData) => {
  const { supabase, workspace } = await getPersonalWorkspace()
  const name = z.string().min(1).max(160).parse(form.get("filename"))
  const mime = z
    .enum(["image/png", "image/jpeg", "image/webp"])
    .parse(form.get("mime_type"))
  return beginMediaUpload(supabase, workspace.id, name, mime)
}
export const completeReferenceUpload = async (assetId: string) => {
  const { supabase, workspace } = await getPersonalWorkspace()
  const result = await finishMediaUpload(
    supabase,
    workspace.id,
    z.uuid().parse(assetId),
  )
  revalidatePath("/studio/library")
  return result
}

export const favoriteAsset = async (assetId: string, favorite: boolean) => {
  const { supabase, workspace } = await getPersonalWorkspace()
  const id = z.uuid().parse(assetId)
  const owned = await supabase
    .from("media_assets")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspace.id)
    .single()
  if (!owned.data) throw new Error("Asset unavailable")
  const result = await supabase.rpc("set_media_favorite", {
    target_asset: id,
    is_favorite: z.boolean().parse(favorite),
  })
  if (result.error) throw new Error("Unable to update favorite")
  revalidatePath("/studio/library")
}

export const approveNativeGeneration = async (form: FormData) => {
  const id = z.uuid().parse(form.get("generation_id"))
  const { supabase } = await requireWebSession(`/studio/native/review/${id}`)
  const result = await supabase.rpc("approve_native_generation", {
    target_generation: id,
  })
  if (result.error) redirect(`/studio/native/review/${id}?error=approval`)
  redirect(`/studio/native/${id}`)
}
export const cancelNativeGeneration = async (form: FormData) => {
  const id = z.uuid().parse(form.get("generation_id"))
  const { supabase } = await requireWebSession(`/studio/native/${id}`)
  const result = await supabase.rpc("cancel_native_generation", {
    target_generation: id,
  })
  if (result.error)
    throw new Error(
      "This request was claimed or cannot be cancelled; operator reconciliation is required",
    )
  redirect(`/studio/native/${id}`)
}
