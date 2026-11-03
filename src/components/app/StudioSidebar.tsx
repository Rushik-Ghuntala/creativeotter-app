"use client"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  Plus,
  Settings2,
  PlugZap,
  ArrowUpRight,
  Coins,
  X,
  LockKeyhole,
} from "lucide-react"
import {
  studioNavigation,
  isStudioLinkActive,
} from "@/constants/studio-navigation"
import { WorkspaceSwitcher } from "@/components/app/WorkspaceSwitcher"
type StudioSidebarProps = {
  collapsed: boolean
  mobileOpen: boolean
  close: () => void
  workspaceName: string
  workspaceId: string
  workspaces: { id: string; name: string }[]
  balance: string | null
}
export const StudioSidebar = ({
  collapsed,
  mobileOpen,
  close,
  workspaceName,
  workspaceId,
  workspaces,
  balance,
}: StudioSidebarProps) => {
  const path = usePathname()
  return (
    <aside
      id="studio-sidebar"
      className={`studio-sidebar ${mobileOpen ? "drawer-open" : ""}`}
      aria-label="Studio sidebar"
      role={mobileOpen ? "dialog" : undefined}
      aria-modal={mobileOpen ? true : undefined}
    >
      <div className="sidebar-brand-row">
        <Link
          href="/studio"
          aria-label="CreativeOtter Studio"
          className="sidebar-brand"
          onClick={close}
        >
          <Image
            src="/creativeotter.png"
            alt=""
            width={38}
            height={38}
          />
          <span className="sidebar-expanded">
            <strong>CreativeOtter</strong>
            <small>YOUR CREATIVE STUDIO</small>
          </span>
        </Link>
        <button
          type="button"
          className="sidebar-mobile-close"
          aria-label="Close navigation"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <div className="sidebar-workspace sidebar-expanded">
        {workspaces.length > 1 ? (
          <WorkspaceSwitcher
            workspaces={workspaces}
            current={workspaceId}
          />
        ) : (
          <div className="sidebar-workspace-card">
            <span className="workspace-monogram">
              {workspaceName[0]?.toUpperCase() || "W"}
            </span>
            <div>
              <small>Workspace</small>
              <strong title={workspaceName}>{workspaceName}</strong>
            </div>
            <LockKeyhole
              size={13}
              aria-hidden="true"
            />
          </div>
        )}
      </div>
      <Link
        href="/studio/create"
        className="sidebar-create"
        onClick={close}
        title={collapsed ? "Create something" : undefined}
      >
        <Plus size={18} />
        <span className="sidebar-expanded">Create something</span>
      </Link>
      <nav
        className="sidebar-navigation"
        aria-label="Studio sections"
      >
        {studioNavigation.map((group) => (
          <div
            key={group.label}
            className="sidebar-nav-group"
          >
            <p className="sidebar-group-label sidebar-expanded">
              {group.label}
            </p>
            {group.items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={
                  isStudioLinkActive(href, path) ? "page" : undefined
                }
                className={`sidebar-link ${isStudioLinkActive(href, path) ? "active" : ""}`}
                title={collapsed ? label : undefined}
                onClick={close}
              >
                <Icon size={18} />
                <span className="sidebar-expanded">{label}</span>
                {isStudioLinkActive(href, path) && (
                  <i className="sidebar-active-dot sidebar-expanded" />
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <nav aria-label="Workspace controls">
          <Link
            className="sidebar-link"
            href="/connect"
            onClick={close}
            title={collapsed ? "Connect assistants" : undefined}
            aria-label="Connect assistants"
          >
            <PlugZap size={17} />
            <span className="sidebar-expanded">Connect assistants</span>
          </Link>
          <Link
            className="sidebar-link"
            href="/account?tab=settings"
            onClick={close}
            title={collapsed ? "Settings" : undefined}
            aria-label="Settings"
          >
            <Settings2 size={17} />
            <span className="sidebar-expanded">Settings</span>
          </Link>
        </nav>
        <Link
          href="/account"
          onClick={close}
          className="sidebar-credits"
          aria-label={
            balance === null
              ? "View account credits"
              : `${balance} available credits`
          }
          title={collapsed ? `${balance ?? "—"} credits` : undefined}
        >
          <Coins size={19} />
          <div className="sidebar-expanded">
            <span>Available credits</span>
            <strong>
              {balance ?? "—"}
              <small> credits</small>
            </strong>
          </div>
          <ArrowUpRight
            className="sidebar-expanded"
            size={16}
          />
        </Link>
        <p className="sidebar-privacy sidebar-expanded">
          <LockKeyhole size={11} />
          Private to your workspace
        </p>
      </div>
    </aside>
  )
}
