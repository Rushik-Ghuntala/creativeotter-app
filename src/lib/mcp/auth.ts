import "server-only"
import { createRemoteJWKSet } from "jose"
import { createClient } from "@supabase/supabase-js"
import { getAuthIssuer, getMcpResource, getPublicEnv } from "@/lib/env"
import { extractBearerToken, verifyMcpToken } from "@/lib/mcp/token"
import type { Database } from "@/lib/database.types"

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

export const authenticateMcp = async (request: Request) => {
  const token = extractBearerToken(request.headers.get("authorization"))
  if (!token) return null
  const issuer = getAuthIssuer()
  jwks ||= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
  let actor
  try {
    actor = await verifyMcpToken(token, jwks, issuer, getMcpResource())
  } catch {
    return null
  }
  const env = getPublicEnv()
  const supabase = createClient<Database>(env.url, env.key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return { actor, supabase, token }
}
