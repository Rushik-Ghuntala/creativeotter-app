import type { ReactNode } from "react"
import { AppShell } from "@/components/app/AppShell"
type StudioLayoutProps = { children: ReactNode }
const StudioLayout = ({ children }: StudioLayoutProps) => (
  <AppShell studio>{children}</AppShell>
)
export default StudioLayout
