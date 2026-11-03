"use client"
import Link from "next/link"
import Form from "next/form"
import { usePathname, useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Search,
  PlugZap,
  RefreshCw,
} from "lucide-react"
import { AccountMenu } from "@/components/app/AccountMenu"
import { studioBreadcrumbs } from "@/constants/studio-navigation"
type StudioTopbarProps = {
  collapsed: boolean
  mobileOpen: boolean
  toggleSidebar: () => void
  openMobile: () => void
  email: string
  displayName: string
  workspaceName: string
}
export const StudioTopbar = ({
  collapsed,
  mobileOpen,
  toggleSidebar,
  openMobile,
  email,
  displayName,
  workspaceName,
}: StudioTopbarProps) => {
  const path = usePathname(),
    router = useRouter(),
    [refreshing, startRefresh] = useTransition(),
    crumbs = studioBreadcrumbs(path)
  return (
    <header className="studio-topbar">
      <div className="studio-toolbar-start">
        <button
          type="button"
          className="toolbar-icon desktop-sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-controls="studio-sidebar"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
        <button
          type="button"
          className="toolbar-icon mobile-sidebar-toggle"
          onClick={openMobile}
          aria-label="Open navigation"
          aria-controls="studio-sidebar"
          aria-expanded={mobileOpen}
        >
          <Menu size={20} />
        </button>
        <nav
          className="studio-breadcrumbs"
          aria-label="Breadcrumb"
        >
          <span className="breadcrumb-studio">Studio</span>
          {crumbs.map((crumb, index) => (
            <span key={crumb.href}>
              <ChevronRight size={12} />
              {index === crumbs.length - 1 ? (
                <strong>{crumb.label}</strong>
              ) : (
                <Link href={crumb.href}>{crumb.label}</Link>
              )}
            </span>
          ))}
        </nav>
      </div>
      <div className="studio-toolbar-actions">
        <Form
          action="/studio/library"
          className="studio-global-search"
        >
          <Search size={15} />
          <input
            type="search"
            name="q"
            aria-label="Search your library"
            placeholder="Search your library…"
          />
        </Form>
        <button
          className="toolbar-icon refresh-workspace"
          type="button"
          title="Refresh workspace"
          aria-label="Refresh workspace"
          disabled={refreshing}
          onClick={() => startRefresh(() => router.refresh())}
        >
          <RefreshCw
            size={16}
            className={refreshing ? "spinning" : ""}
          />
        </button>
        <Link
          className="toolbar-connect"
          aria-label="Connect assistant"
          href="/connect"
        >
          <PlugZap size={15} />
          <span>Connect assistant</span>
        </Link>
        <AccountMenu
          compact
          email={email}
          displayName={displayName}
          workspaceName={workspaceName}
        />
      </div>
    </header>
  )
}
