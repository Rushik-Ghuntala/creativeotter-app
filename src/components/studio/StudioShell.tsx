import type { ReactNode } from "react"
import { AppShell } from "@/components/app/AppShell"
type StudioShellProps = { children: ReactNode }
export const StudioShell = ({ children }: StudioShellProps) => (
  <AppShell studio>{children}</AppShell>
)
