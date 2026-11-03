"use server"

import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getPersonalWorkspace, requireWebSession } from "@/lib/auth/session"
import { getAppUrl } from "@/lib/env"
import {
  saveStudioRecord,
  archiveStudioRecord,
  saveStoryboardShot,
  assignProjectAsset,
} from "@/lib/studio/service"
import {
  sectionSchema,
  creditsToUnits,
  type ActionState,
} from "@/lib/studio/contracts"

const failure = (error: unknown): ActionState => ({
  error:
    error instanceof z.ZodError
      ? error.issues
          .map((x) => `${x.path.join(" ") || "Input"}: ${x.message}`)
          .slice(0, 2)
          .join(". ")
      : error instanceof Error
        ? error.message
        : "Unable to save. Please try again.",
})
const field = (form: FormData, name: string) => String(form.get(name) || "")
const invalidate = () => {
  revalidatePath("/studio", "layout")
  revalidatePath("/account")
  revalidatePath("/dashboard")
}
export const saveRecordAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, workspace } = await getPersonalWorkspace()
  let next = ""
  try {
    const section = sectionSchema.parse(field(form, "section")),
      id = z
        .uuid()
        .optional()
        .parse(field(form, "id") || undefined)
    const base = {
      name: field(form, "name"),
      description: field(form, "description"),
    }
    const value =
      section === "characters"
        ? {
            ...base,
            appearance: field(form, "appearance"),
            identity_type: field(form, "identity_type"),
            reference_asset_id: field(form, "reference_asset_id"),
          }
        : section === "brands"
          ? {
              ...base,
              colors: field(form, "colors")
                .split(/[\s,]+/)
                .filter(Boolean),
              font_family: field(form, "font_family"),
              tone: field(form, "tone"),
              logo_asset_id: field(form, "logo_asset_id"),
            }
          : section === "voices"
            ? {
                ...base,
                language: field(form, "language"),
                script: field(form, "script"),
                style: field(form, "style"),
              }
            : {
                ...base,
                kind:
                  section === "films"
                    ? "film"
                    : section === "music"
                      ? "music"
                      : "campaign",
                status: field(form, "status") || "draft",
                budget_target_units: field(form, "budget")
                  ? creditsToUnits(field(form, "budget"))
                  : null,
                aspect_ratio: field(form, "aspect_ratio") || "9:16",
                genre: field(form, "genre"),
                lyrics: field(form, "lyrics"),
              }
    next = (await saveStudioRecord(supabase, workspace.id, section, value, id))
      .url
  } catch (error) {
    return failure(error)
  }
  invalidate()
  redirect(next)
}
export const archiveRecordAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, workspace } = await getPersonalWorkspace()
  try {
    await archiveStudioRecord(
      supabase,
      workspace.id,
      sectionSchema.parse(field(form, "section")),
      z.uuid().parse(field(form, "id")),
      field(form, "archive") === "true",
    )
  } catch (error) {
    return failure(error)
  }
  invalidate()
  return {
    message:
      field(form, "archive") === "true"
        ? "Archived. You can restore it from Archived."
        : "Restored to your Studio.",
  }
}
export const saveShotAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, workspace } = await getPersonalWorkspace()
  try {
    await saveStoryboardShot(
      supabase,
      workspace.id,
      {
        project_id: field(form, "project_id"),
        position: Number(form.get("position")),
        prompt: field(form, "prompt"),
        narration: field(form, "narration"),
        duration_seconds: Number(form.get("duration_seconds")),
        reference_asset_id: field(form, "reference_asset_id"),
      },
      field(form, "id") || undefined,
    )
  } catch (error) {
    return failure(error)
  }
  invalidate()
  return { message: "Shot saved to your storyboard." }
}
export const removeShotAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, workspace } = await getPersonalWorkspace()
  const id = z.uuid().safeParse(form.get("id"))
  if (!id.success) return { error: "Invalid shot" }
  const result = await supabase
    .from("studio_shots")
    .delete()
    .eq("workspace_id", workspace.id)
    .eq("id", id.data)
    .select("id")
    .single()
  if (result.error) return { error: "Unable to remove this shot" }
  invalidate()
  return { message: "Shot removed." }
}
export const attachAssetAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, workspace } = await getPersonalWorkspace()
  try {
    await assignProjectAsset(
      supabase,
      workspace.id,
      field(form, "project_id"),
      field(form, "asset_id"),
    )
  } catch (error) {
    return failure(error)
  }
  invalidate()
  return {
    message:
      "Asset attached. Its original charge is counted once in this project.",
  }
}
export const detachAssetAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, workspace } = await getPersonalWorkspace()
  const result = await supabase
    .from("studio_project_assets")
    .delete()
    .eq("workspace_id", workspace.id)
    .eq("project_id", z.uuid().parse(form.get("project_id")))
    .eq("asset_id", z.uuid().parse(form.get("asset_id")))
  if (result.error) return { error: "Unable to remove this assignment" }
  invalidate()
  return {
    message:
      "Assignment removed. Saved media and original charges are unchanged.",
  }
}
export const saveProfileAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, user } = await requireWebSession()
  const name = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .safeParse(form.get("display_name"))
  if (!name.success) return { error: "Use a name of 1–80 characters." }
  const result = await supabase
    .from("profiles")
    .update({ display_name: name.data })
    .eq("id", user.id)
  if (result.error) return { error: "Unable to update your profile" }
  invalidate()
  return { message: "Profile updated." }
}
export const saveWorkspaceAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, workspace } = await getPersonalWorkspace()
  const name = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .safeParse(form.get("workspace_name"))
  if (!name.success)
    return { error: "Use a workspace name of 1–80 characters." }
  const result = await supabase
    .from("workspaces")
    .update({ name: name.data })
    .eq("id", workspace.id)
    .select("id")
    .single()
  if (result.error)
    return { error: "Only a workspace administrator can update the name." }
  invalidate()
  return { message: "Workspace updated." }
}
export const savePreferencesAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, workspace } = await getPersonalWorkspace()
  const mode = z.enum(["review", "auto"]).safeParse(form.get("video_mode"))
  if (!mode.success) return { error: "Choose a valid video preference" }
  const result = await supabase.from("workspace_preferences").upsert({
    workspace_id: workspace.id,
    video_mode: mode.data,
    updated_at: new Date().toISOString(),
  })
  if (result.error)
    return {
      error: "Only a workspace administrator can update these preferences.",
    }
  invalidate()
  return { message: "Preferences saved. Paid video services remain disabled." }
}
export const switchWorkspaceAction = async (form: FormData) => {
  const { supabase } = await requireWebSession()
  const id = z.uuid().parse(form.get("workspace_id"))
  const { data } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", id)
    .single()
  if (!data) throw new Error("Workspace access denied")
  const store = await cookies()
  store.set("creativeotter_workspace", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  invalidate()
  redirect("/studio")
}
export const createInviteAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, workspace } = await getPersonalWorkspace()
  const email = z.email().max(254).safeParse(form.get("email")),
    role = z.enum(["creator", "viewer"]).safeParse(form.get("role"))
  if (!email.success || !role.success)
    return { error: "Enter a valid email and role." }
  const token = randomBytes(32).toString("hex"),
    hash = createHash("sha256").update(token).digest("hex")
  const result = await supabase.rpc("create_workspace_invite", {
    target_workspace: workspace.id,
    invite_email: email.data,
    invite_role: role.data,
    secret_hash: hash,
  })
  if (result.error)
    return { error: "Only a workspace administrator can create an invitation." }
  revalidatePath("/account")
  return {
    message:
      "Invitation created. Share this private link with the named teammate; it expires in seven days. No email was sent.",
    invitation_url: `${getAppUrl()}/invite?token=${token}`,
  }
}
export const revokeInviteAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase } = await requireWebSession()
  const result = await supabase.rpc("revoke_workspace_invite", {
    target_invite: z.uuid().parse(form.get("id")),
  })
  if (result.error) return { error: "Unable to revoke this invitation" }
  revalidatePath("/account")
  return { message: "Invitation revoked." }
}
export const acceptInviteAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase } = await requireWebSession()
  const token = z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .safeParse(form.get("token"))
  if (!token.success) return { error: "Invalid invitation" }
  const result = await supabase.rpc("accept_workspace_invite", {
    secret_hash: createHash("sha256").update(token.data).digest("hex"),
  })
  if (result.error)
    return {
      error:
        "This invitation is expired, already used or intended for a different verified email.",
    }
  const store = await cookies()
  store.set("creativeotter_workspace", result.data, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })
  invalidate()
  redirect("/studio")
}
export const supportRequestAction = async (
  _state: ActionState,
  form: FormData,
): Promise<ActionState> => {
  const { supabase, user, workspace } = await getPersonalWorkspace()
  const category = z
      .enum(["support", "deletion"])
      .safeParse(form.get("category")),
    message = z.string().trim().min(1).max(4000).safeParse(form.get("message"))
  if (!category.success || !message.success)
    return { error: "Describe your request in 1–4,000 characters." }
  const result = await supabase
    .from("support_requests")
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      category: category.data,
      message: message.data,
    })
    .select("id")
    .single()
  if (result.error) return { error: "Unable to save your request" }
  revalidatePath("/account")
  return {
    message: `Request ${result.data.id.slice(0, 8)} saved for the workspace operator. No automatic deletion or external message was performed.`,
  }
}
