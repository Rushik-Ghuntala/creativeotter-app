import "server-only"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth/redirects"

export const requireWebSession = async (next = "/dashboard") => {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    redirect(`/auth/login?next=${encodeURIComponent(safeNextPath(next))}`)
  }
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims || claims.claims.client_id) {
    await supabase.auth.signOut({ scope: "local" })
    redirect("/auth/login?error=direct_session_required")
  }
  return { supabase, user: data.user }
}

export const getPersonalWorkspace = async () => {
  const session = await requireWebSession()
  const { data, error } = await session.supabase.rpc(
    "ensure_personal_workspace",
  )
  if (error || !data)
    throw new Error("Unable to load your workspace. Please try again.")
  return { ...session, workspace: data }
}
