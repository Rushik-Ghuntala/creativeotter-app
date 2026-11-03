import type { ReactNode } from "react"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { getCreditSummary } from "@/lib/credits/service"
import { unitsToCredits } from "@/lib/studio/contracts"
import { AppHeader } from "@/components/app/AppHeader"
import { StudioFrame } from "@/components/app/StudioFrame"
import { WorkspaceSwitcher } from "@/components/app/WorkspaceSwitcher"
type AppShellProps = { children: ReactNode; studio?: boolean }
export const AppShell = async ({ children, studio = false }: AppShellProps) => {
  const { supabase, user, workspace } = await getPersonalWorkspace()
  const [profile, summary, workspaces] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    getCreditSummary(supabase, workspace.id),
    supabase.from("workspaces").select("id,name"),
  ])
  const displayName =
    profile.data?.display_name || user.email?.split("@")[0] || "Creator"
  if (studio)
    return (
      <div className="otter-app studio-app sidebar-studio">
        <StudioFrame
          email={user.email || ""}
          displayName={displayName}
          workspaceName={workspace.name}
          workspaceId={workspace.id}
          workspaces={workspaces.data || []}
          balance={summary ? unitsToCredits(summary.available_units) : null}
        >
          {children}
        </StudioFrame>
      </div>
    )
  return (
    <div className="otter-app account-app">
      <AppHeader
        email={user.email || ""}
        displayName={displayName}
        workspaceName={workspace.name}
      />
      {(workspaces.data?.length || 0) > 1 && (
        <WorkspaceSwitcher
          workspaces={workspaces.data || []}
          current={workspace.id}
        />
      )}
      <main className="account-main">{children}</main>
      <footer className="app-footer">
        <span>
          CreativeOtter <span className="otter-spark">✳</span> A home for your
          next idea.
        </span>
        <a href="/connect">One workspace. All your assistants. ↗</a>
      </footer>
    </div>
  )
}
