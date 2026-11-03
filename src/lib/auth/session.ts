import { cache } from "react"
import { cookies } from "next/headers"
import "server-only"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth/redirects"

// React cache is scoped to one server render, never shared between users.
const readWebSession = cache(async () => {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims || claims.claims.client_id) {
    await supabase.auth.signOut({ scope: "local" })
    redirect("/auth/login?error=direct_session_required")
  }
  return { supabase, user: data.user }
})

export const requireWebSession = async (next = "/dashboard") => {
  const session = await readWebSession()
  if (!session)
    redirect(`/auth/login?next=${encodeURIComponent(safeNextPath(next))}`)
  return session
}

const readPersonalWorkspace = cache(async () => {
  const session = await readWebSession()
  if (!session) return null
  const { data, error } = await session.supabase.rpc(
    "ensure_personal_workspace",
  )
  if (error || !data)
    throw new Error("Unable to load your workspace. Please try again.")
  const selected = (await cookies()).get("creativeotter_workspace")?.value
  if (selected && /^[0-9a-f-]{36}$/.test(selected) && selected !== data.id) {
    const member = await session.supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", selected)
      .eq("user_id", session.user.id)
      .single()
    if (member.data) {
      const active = await session.supabase
        .from("workspaces")
        .select("*")
        .eq("id", selected)
        .single()
      if (active.data) return { ...session, workspace: active.data }
    }
  }
  return { ...session, workspace: data }
})

export const getPersonalWorkspace = async (next = "/dashboard") => {
  const session = await readPersonalWorkspace()
  if (!session)
    redirect(`/auth/login?next=${encodeURIComponent(safeNextPath(next))}`)
  return session
}
