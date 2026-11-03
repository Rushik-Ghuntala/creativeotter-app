import type { ReactNode } from "react"
type StudioShellProps = { children: ReactNode }
export const StudioShell = ({ children }: StudioShellProps) => (
  <div className="studio-page">{children}</div>
)
