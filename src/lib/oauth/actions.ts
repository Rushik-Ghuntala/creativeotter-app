"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireWebSession } from "@/lib/auth/session"
import { authorizationIdSchema } from "@/lib/oauth/authorization"
import { isSupportedConsentScope } from "@/lib/oauth/scopes"

export const decideAuthorization = async (form: FormData) => {
  const id = authorizationIdSchema.parse(form.get("authorization_id"))
  const decision = z.enum(["approve", "deny"]).parse(form.get("decision"))
  const { supabase } = await requireWebSession(
    `/oauth/consent?authorization_id=${id}`,
  )
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id)
  if (error || !data)
    redirect(`/oauth/consent?authorization_id=${id}&error=expired`)
  if ("redirect_url" in data) redirect(data.redirect_url)
  if (decision === "deny") {
    const result = await supabase.auth.oauth.denyAuthorization(id, {
      skipBrowserRedirect: true,
    })
    if (result.error || !result.data)
      redirect(`/oauth/consent?authorization_id=${id}&error=failed`)
    redirect(result.data.redirect_url)
  }
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user || data.user.id !== userData.user.id)
    throw new Error("Authorization account mismatch")
  // OIDC scopes disclose identity; workspace permission is separate and enforced by RLS.
  if (!isSupportedConsentScope(data.scope)) {
    redirect(`/oauth/consent?authorization_id=${id}&error=scope`)
  }
  const { data: workspace, error: workspaceError } = await supabase.rpc(
    "ensure_personal_workspace",
  )
  if (workspaceError || !workspace)
    throw new Error("Unable to load your workspace")
  const { error: grantError } = await supabase.from("client_grants").upsert(
    {
      user_id: userData.user.id,
      client_id: data.client.id,
      client_name: data.client.name.slice(0, 200),
      redirect_uri: data.redirect_uri,
      workspace_id: workspace.id,
      permissions:
        form.get("media_access") === "yes"
          ? ["account:read", "media:read", "media:prepare"]
          : ["account:read"],
      revoked_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,client_id" },
  )
  if (grantError) throw new Error("Unable to save workspace permission")
  const result = await supabase.auth.oauth.approveAuthorization(id, {
    skipBrowserRedirect: true,
  })
  if (result.error || !result.data)
    redirect(`/oauth/consent?authorization_id=${id}&error=failed`)
  redirect(result.data.redirect_url)
}

export const revokeClientAccess = async (form: FormData) => {
  const clientId = z.string().min(1).max(2048).parse(form.get("client_id"))
  const { supabase, user } = await requireWebSession()
  const { error } = await supabase
    .from("client_grants")
    .update({
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("client_id", clientId)
  if (error) throw new Error("Unable to revoke access")
  const oauth = await supabase.auth.oauth.revokeGrant({ clientId })
  revalidatePath("/dashboard")
  revalidatePath("/account")
  if (oauth.error)
    redirect("/account?tab=settings&notice=access_revoked_oauth_pending")
  redirect("/account?tab=settings&notice=access_revoked")
}
