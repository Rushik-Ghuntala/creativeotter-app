"use client"

import type { ReactNode } from "react"

type ClientLayoutProps = { children: ReactNode }
const ClientLayout = ({ children }: ClientLayoutProps) => (
  <div id="root">{children}</div>
)
export default ClientLayout
