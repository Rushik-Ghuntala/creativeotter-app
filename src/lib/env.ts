import { z } from "zod"

export const getPublicEnv = () =>
  z.object({ url: z.url(), key: z.string().min(1) }).parse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })

export const getAppUrl = () => {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const value = configured || (vercel ? `https://${vercel}` : undefined)
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("Set NEXT_PUBLIC_APP_URL to the stable deployment URL")
  }
  const url = new URL(value || "http://localhost:3000")
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && url.hostname === "localhost"))
  ) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be an HTTPS origin (localhost in development)",
    )
  }
  return url.origin
}

export const getMcpResource = () => `${getAppUrl()}/api/mcp`
export const getAuthIssuer = () =>
  `${getPublicEnv().url.replace(/\/$/, "")}/auth/v1`
