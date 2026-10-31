import Link from "next/link"
import type { ReactNode } from "react"
import { Brand } from "@/components/common/Brand"

type StudioShellProps = { children: ReactNode }
export const StudioShell = ({ children }: StudioShellProps) => (
  <div className="min-h-screen bg-[#f6f5ef] text-stone-900">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 border-b border-stone-200 px-6 py-5">
      <Brand />
      <nav className="flex gap-5 text-sm text-stone-600">
        <Link href="/studio/library">Library</Link>
        <Link href="/dashboard">Account</Link>
      </nav>
    </header>
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">{children}</main>
  </div>
)
