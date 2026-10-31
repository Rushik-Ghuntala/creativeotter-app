import { jwtVerify, type JWTVerifyGetKey } from "jose"
import { z } from "zod"

const claimsSchema = z.object({
  sub: z.uuid(),
  client_id: z.string().min(1),
  role: z.literal("authenticated"),
  exp: z.number(),
})

export const verifyMcpToken = async (
  token: string,
  key: JWTVerifyGetKey,
  issuer: string,
  resource: string,
) => {
  const { payload } = await jwtVerify(token, key, {
    issuer,
    audience: resource,
    algorithms: ["ES256", "RS256", "EdDSA"],
    requiredClaims: ["sub", "exp", "iat", "client_id"],
  })
  return claimsSchema.parse(payload)
}

export const extractBearerToken = (header: string | null) => {
  if (!header || header.length > 20000) return null
  return /^Bearer ([A-Za-z0-9._~-]+)$/i.exec(header)?.[1] || null
}
