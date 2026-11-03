"use client"
import { useEffect, useState, type ReactNode } from "react"
import { StudioSidebar } from "@/components/app/StudioSidebar"
import { StudioTopbar } from "@/components/app/StudioTopbar"
type StudioFrameProps = {
  children: ReactNode
  email: string
  displayName: string
  workspaceName: string
  workspaceId: string
  workspaces: { id: string; name: string }[]
  balance: string | null
}
export const StudioFrame = ({
  children,
  email,
  displayName,
  workspaceName,
  workspaceId,
  workspaces,
  balance,
}: StudioFrameProps) => {
  const [collapsed, setCollapsed] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    if (!mobileOpen) return
    const sidebar = document.getElementById("studio-sidebar"),
      previousFocus = document.activeElement as HTMLElement | null,
      previousOverflow = document.body.style.overflow
    const focusable = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled), select:not(:disabled), input:not(:disabled)",
        ) || [],
      ).filter((element) => element.getClientRects().length > 0)
    document.body.style.overflow = "hidden"
    focusable()[0]?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setMobileOpen(false)
        return
      }
      if (event.key !== "Tab") return
      const elements = focusable(),
        first = elements[0],
        last = elements.at(-1)
      if (!first) return
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !sidebar?.contains(document.activeElement))
      ) {
        event.preventDefault()
        last?.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !sidebar?.contains(document.activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    const media = window.matchMedia("(max-width: 900px)")
    const handleResize = () => {
      if (!media.matches) setMobileOpen(false)
    }
    document.addEventListener("keydown", handleKey)
    media.addEventListener("change", handleResize)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKey)
      media.removeEventListener("change", handleResize)
      previousFocus?.focus()
    }
  }, [mobileOpen])
  return (
    <div className={`studio-frame ${collapsed ? "sidebar-collapsed" : ""}`}>
      <a
        href="#studio-content"
        className="studio-skip-link"
      >
        Skip to content
      </a>
      <StudioSidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        close={() => setMobileOpen(false)}
        workspaceName={workspaceName}
        workspaceId={workspaceId}
        workspaces={workspaces}
        balance={balance}
      />
      {mobileOpen && (
        <button
          className="studio-drawer-backdrop"
          tabIndex={-1}
          aria-label="Dismiss navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="studio-workspace-content">
        <StudioTopbar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          toggleSidebar={() => setCollapsed((value) => !value)}
          openMobile={() => setMobileOpen(true)}
          email={email}
          displayName={displayName}
          workspaceName={workspaceName}
        />
        <main
          id="studio-content"
          tabIndex={-1}
          className="studio-main"
        >
          {children}
        </main>
        <footer className="studio-workspace-footer">
          <span>
            CreativeOtter <span>✳</span> Make something worth sharing.
          </span>
          <a href="/connect">Your assistants. One creative home. ↗</a>
        </footer>
      </div>
    </div>
  )
}
