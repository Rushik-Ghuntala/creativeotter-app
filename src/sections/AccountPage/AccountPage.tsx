import { AppShell } from "@/components/app/AppShell"
import { AccountNavigation } from "@/components/account/AccountNavigation"
import { CreditsPanel } from "@/components/account/CreditsPanel"
import { BillingPanel } from "@/components/account/BillingPanel"
import { SettingsPanel } from "@/components/account/SettingsPanel"
import { TeamPanel } from "@/components/account/TeamPanel"
import { LibraryBrowser } from "@/components/studio/LibraryBrowser"
import { LibraryUploader } from "@/components/studio/LibraryUploader"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { getCreditSummary } from "@/lib/credits/service"
import { listLibraryAssets, getRecentCreditUsage } from "@/lib/studio/service"
import { unitsToCredits } from "@/lib/studio/contracts"
import { getMediaAccess } from "@/lib/media/service"
import type { Json } from "@/lib/database.types"
export type AccountPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const AccountPage = async ({ searchParams }: AccountPageProps) => {
  const params = await searchParams,
    value = typeof params.tab === "string" ? params.tab : "credits",
    tab = ["credits", "billing", "library", "team", "settings"].includes(value)
      ? value
      : "credits"
  const { supabase, user, workspace } = await getPersonalWorkspace(
    `/account?tab=${tab}`,
  )
  const summary = await getCreditSummary(supabase, workspace.id)
  let content
  if (tab === "credits") {
    const recentUsed = await getRecentCreditUsage(supabase, workspace.id)
    content = (
      <CreditsPanel
        summary={summary}
        recentUsed={recentUsed}
      />
    )
  } else if (tab === "billing") {
    const ledger = await supabase
      .from("credit_ledger")
      .select(
        "id,kind,amount_units,note,created_at,job_id,native_generation_id",
      )
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(200)
    if (ledger.error) throw new Error("Unable to read billing activity")
    content = (
      <BillingPanel
        rows={ledger.data}
        balance={summary ? unitsToCredits(summary.available_units) : null}
      />
    )
  } else if (tab === "library") {
    const options = {
      q: String(params.q || ""),
      kind: String(params.kind || "output"),
      favorite: params.favorites === "true",
      page: Math.max(1, Number(params.page) || 1),
    }
    const [library, access] = await Promise.all([
      listLibraryAssets(supabase, workspace.id, options),
      getMediaAccess(supabase, workspace.id),
    ])
    content = (
      <>
        <div className="section-subheading">
          <h2>Your generations</h2>
          <p>
            Generated images and private uploads, saved across your assistants.
          </p>
        </div>
        {access.enabled && access.can_prepare && <LibraryUploader />}
        <LibraryBrowser
          key={workspace.id}
          {...library}
          {...options}
          basePath="/account"
        />
      </>
    )
  } else if (tab === "team") {
    const [members, invites, admin] = await Promise.all([
      supabase.rpc("list_workspace_members", {
        target_workspace: workspace.id,
      }),
      supabase
        .from("workspace_invites")
        .select("id,email,role,expires_at,accepted_at,revoked_at")
        .eq("workspace_id", workspace.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.rpc("can_admin_workspace", { target_workspace: workspace.id }),
    ])
    if (members.error || invites.error)
      throw new Error("Unable to load workspace members")
    content = (
      <TeamPanel
        members={members.data as Json}
        invites={invites.data}
        admin={Boolean(admin.data)}
        workspaceName={workspace.name}
      />
    )
  } else {
    const [profile, preferences, grants, requests, admin] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single(),
      supabase
        .from("workspace_preferences")
        .select("*")
        .eq("workspace_id", workspace.id)
        .maybeSingle(),
      supabase
        .from("client_grants")
        .select("*")
        .eq("workspace_id", workspace.id)
        .is("revoked_at", null),
      supabase
        .from("support_requests")
        .select("*")
        .eq("workspace_id", workspace.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.rpc("can_admin_workspace", { target_workspace: workspace.id }),
    ])
    if (preferences.error || grants.error || requests.error)
      throw new Error("Unable to read workspace settings")
    content = (
      <SettingsPanel
        name={profile.data?.display_name || ""}
        email={user.email || ""}
        workspaceName={workspace.name}
        preferences={preferences.data}
        grants={grants.data}
        requests={requests.data}
        admin={Boolean(admin.data)}
      />
    )
  }
  return (
    <AppShell>
      <h1 className="account-title">Account</h1>
      <AccountNavigation active={tab} />
      {content}
    </AppShell>
  )
}
export default AccountPage
