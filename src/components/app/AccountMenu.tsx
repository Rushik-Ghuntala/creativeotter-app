"use client"
import Link from "next/link"
import { LogOut, PlugZap, Settings2, ArrowUpRight } from "lucide-react"
import { signOut } from "@/lib/auth/actions"
type AccountMenuProps = {
  email: string
  displayName: string
  workspaceName: string
  compact?: boolean
}
export const AccountMenu = ({
  email,
  displayName,
  workspaceName,
  compact = false,
}: AccountMenuProps) => (
  <details className="user-menu">
    <summary aria-label="Open account menu">
      <span className="user-initial">
        {(displayName || email || "O")[0].toUpperCase()}
      </span>
      {!compact && (
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
      <Link href="/account">
        <ArrowUpRight size={15} />
        Account & credits
      </Link>
      <Link href="/connect">
        <PlugZap size={15} />
        Connect assistants
      </Link>
      <Link href="/account?tab=settings">
        <Settings2 size={15} />
        Settings
      </Link>
      <form action={signOut}>
        <button type="submit">
          <LogOut size={15} />
          Sign out
        </button>
      </form>
    </div>
  </details>
)
