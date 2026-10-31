"use client"

import { ReactNode, useEffect } from "react"
import { verifyAccessToken } from "@/utils/cookies"
import { usePathname } from "next/navigation"
import { Inter } from "next/font/google"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
})

export default function ClientLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const pathName = usePathname()
  useEffect(() => {
    verifyAccessToken()
  }, [pathName])

  return (
    <main
      id={"root"}
      className={`${inter.className} antialiased`}
    >
      {children}
    </main>
  )
}
