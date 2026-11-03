import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Geist, Geist_Mono } from "next/font/google"
import "@/styles/globals.css"
import "@/styles/app.css"
import Provider from "@/providers/provider"
import ClientLayout from "@/app/clientLayout"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})
export const metadata: Metadata = {
  title: "CreativeOtter",
  description: "Your creative workspace, connected to Codex and Claude.",
}

type RootLayoutProps = { children: ReactNode }
const RootLayout = ({ children }: RootLayoutProps) => (
  <html lang="en">
    <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <Provider>
        <ClientLayout>{children}</ClientLayout>
      </Provider>
    </body>
  </html>
)
export default RootLayout
