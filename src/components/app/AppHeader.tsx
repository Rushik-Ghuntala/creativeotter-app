"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  Home,
  UsersRound,
  Film,
  AudioLines,
  Music2,
  Grid2X2,
  Folder,
  Settings2,
  Palette,
  PlugZap,
  ArrowUpRight,
  LogOut,
} from "lucide-react"
import { signOut } from "@/lib/auth/actions"

type AppHeaderProps = {
  studio?: boolean
  email: string
  displayName: string
  balance: string | null
  workspaceName: string
}
const links = [
  { href: "/studio", label: "Home", icon: Home },
  { href: "/studio/characters", label: "Characters", icon: UsersRound },
  { href: "/studio/films", label: "Films", icon: Film },
  { href: "/studio/voices", label: "Voices", icon: AudioLines },
  { href: "/studio/music", label: "Music", icon: Music2 },
  { href: "/studio/library", label: "Library", icon: Grid2X2 },
  { href: "/studio/projects", label: "Projects", icon: Folder },
  { href: "/studio/brands", label: "Brands", icon: Palette },
]
export const AppHeader = ({
  studio = false,
  email,
  displayName,
  balance,
  workspaceName,
}: AppHeaderProps) => {
  const path = usePathname()
  return (
    <header
      className={`app-header ${studio ? "studio-header" : "account-header"}`}
    >
      <Link
        href="/studio"
        className="app-wordmark"
      >
        <Image
          src="/creativeotter.png"
          width={40}
          height={40}
          alt=""
        />
        <span>{studio ? "Studio" : "CreativeOtter"}</span>
      </Link>
      {studio && (
        <nav
          className="studio-navigation"
          aria-label="Studio sections"
        >
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={
                (href === "/studio" ? path === href : path.startsWith(href))
                  ? "active"
                  : ""
              }
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
          <Link href="/account?tab=settings">
            <Settings2 size={16} />
            Settings
          </Link>
        </nav>
      )}
      <div className="header-actions">
        {!studio && (
          <Link
            className="header-studio-link"
            href="/studio"
          >
            Open Studio <ArrowUpRight size={15} />
          </Link>
        )}
        {studio && (
          <Link
            className="balance-pill"
            href="/account"
          >
            {balance ?? "—"}
            <span>credits</span>
          </Link>
        )}
        <details className="user-menu">
          <summary aria-label="Open account menu">
            <span className="user-initial">
              {(displayName || email || "O")[0].toUpperCase()}
            </span>
            {!studio && (
              <span className="user-caption">
                <strong>{displayName}</strong>
                <small>{email}</small>
              </span>
            )}
          </summary>
          <div className="user-menu-content">
            <strong>{displayName}</strong>
            <small>{email}</small>
            <small>{workspaceName}</small>
            <Link href="/account">Account & credits</Link>
            <Link href="/connect">
              <PlugZap size={15} />
              Connect assistants
            </Link>
            <Link href="/account?tab=settings">Settings</Link>
            <form action={signOut}>
              <button type="submit">
                <LogOut size={15} />
                Sign out
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  )
}
