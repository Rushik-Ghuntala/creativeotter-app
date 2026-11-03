import type { ReactNode } from "react"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { getCreditSummary } from "@/lib/credits/service"
import { unitsToCredits } from "@/lib/studio/contracts"
import { AppHeader } from "@/components/app/AppHeader"
import { WorkspaceSwitcher } from "@/components/app/WorkspaceSwitcher"

type AppShellProps = { children: ReactNode; studio?: boolean }
export const AppShell = async ({ children, studio = false }: AppShellProps) => {
  const { supabase, user, workspace } = await getPersonalWorkspace()
  const [profile, summary, workspaces] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    getCreditSummary(supabase, workspace.id),
    supabase.from("workspaces").select("id,name"),
  ])
  return (
    <div className={`otter-app ${studio ? "studio-app" : "account-app"}`}>
      <AppHeader
        studio={studio}
        email={user.email || ""}
        displayName={
          profile.data?.display_name || user.email?.split("@")[0] || "Creator"
        }
        workspaceName={workspace.name}
        balance={summary ? unitsToCredits(summary.available_units) : null}
      />
      {(workspaces.data?.length || 0) > 1 && (
        <WorkspaceSwitcher
          workspaces={workspaces.data || []}
          current={workspace.id}
        />
      )}
      <main className={studio ? "studio-main" : "account-main"}>
        {children}
      </main>
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
