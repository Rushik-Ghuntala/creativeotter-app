import { getAppUrl, getAuthIssuer, getMcpResource } from "@/lib/env"

export const getProtectedResourceMetadata = () => ({
  resource: getMcpResource(),
  authorization_servers: [getAuthIssuer()],
  scopes_supported: ["email"],
  bearer_methods_supported: ["header"],
  resource_name: "CreativeOtter",
})

export const getAuthChallenge = () =>
  `Bearer resource_metadata="${getAppUrl()}/.well-known/oauth-protected-resource", scope="email"`

export const isAllowedMcpOrigin = (origin: string | null) => {
  if (!origin) return true
  const allowed = [getAppUrl(), "https://chatgpt.com", "https://claude.ai"]
  return allowed.includes(origin)
}
