import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { createSavedPreviewAccess } from "@/lib/mcp/saved-preview"
import { createHmac } from "node:crypto"
import { EncryptJWT, jwtDecrypt, decodeJwt } from "jose"
import { z } from "zod"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { McpContext } from "@/lib/database.types"
import { getAppUrl } from "@/lib/env"
import { generationSnapshotSchema } from "@/lib/media/contracts"
import { gallerySnapshotSchema } from "@/lib/media/gallery-contracts"
import {
  PREVIEW_ACCESS_META,
  previewReferenceSchema,
  type PreviewAccess,
} from "@/lib/mcp/preview-access-contracts"

const audience = () => `${getAppUrl()}/api/preview/status`
const key = () => {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("Preview encryption is not configured")
  return createHmac("sha256", secret)
    .update("creativeotter:preview:read-only:v1")
    .digest()
}
const claimsSchema = z.object({
  sub: z.uuid(),
  client_id: z.string().min(1),
  workspace_id: z.uuid(),
  access_token: z.string().min(1).max(16000),
  generations: z.array(previewReferenceSchema).min(1).max(20),
})
export const createPreviewAccess = async (
  accessToken: string,
  context: McpContext,
  generations: z.infer<typeof previewReferenceSchema>[],
): Promise<PreviewAccess & { expires_at: string }> => {
  const claims = claimsSchema.parse({
    sub: context.user_id,
    client_id: context.client_id,
    workspace_id: context.workspace.id,
    access_token: accessToken,
    generations,
  })
  const originalExpiry = decodeJwt(accessToken).exp
  if (!originalExpiry || originalExpiry <= Math.floor(Date.now() / 1000))
    throw new Error("Original sign-in expired")
  const expires = Math.min(
    Math.floor(Date.now() / 1000) + 15 * 60,
    originalExpiry,
  )
  const token = await new EncryptJWT(claims)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
    .setIssuer(getAppUrl())
    .setAudience(audience())
    .setIssuedAt()
    .setExpirationTime(expires)
    .encrypt(key())
  return {
    url: audience(),
    token,
    expires_at: new Date(expires * 1000).toISOString(),
  }
}
export const decryptPreviewAccess = async (token: string) => {
  if (token.length > 20000) throw new Error("Invalid preview access")
  const { payload } = await jwtDecrypt(token, key(), {
    issuer: getAppUrl(),
    audience: audience(),
    keyManagementAlgorithms: ["dir"],
    contentEncryptionAlgorithms: ["A256GCM"],
    requiredClaims: ["sub", "iat", "exp"],
  })
  return claimsSchema.parse(payload)
}
export const attachPreviewAccess = async <T extends CallToolResult>(
  result: T,
  accessToken: string | undefined,
  context: McpContext,
  client?: SupabaseClient<Database>,
): Promise<T> => {
  if (!accessToken || result.isError) return result
  const single = generationSnapshotSchema.safeParse(result.structuredContent)
  const gallery = gallerySnapshotSchema.safeParse(result.structuredContent)
  const items = single.success
    ? [single.data]
    : gallery.success
      ? gallery.data.items
      : []
  if (!items.length) return result
  const references = items.map(({ generation_id, execution_source }) => ({
    generation_id,
    execution_source,
  }))
  const access =
    client &&
    items.every((item) => item.state === "succeeded" && item.outputs.length)
      ? await createSavedPreviewAccess(client, context.workspace.id, references)
      : await createPreviewAccess(accessToken, context, references)
  return {
    ...result,
    _meta: { ...result._meta, [PREVIEW_ACCESS_META]: access },
  }
}
