import { z } from "zod"
import { galleryRequestSchema } from "@/lib/media/gallery-contracts"

export const previewReferenceSchema =
  galleryRequestSchema.shape.generations.element
export const PREVIEW_ACCESS_META = "creativeotter/preview-access"
export const previewAccessSchema = z.object({
  url: z.url(),
  token: z.string().min(1).max(20000),
  expires_at: z.iso.datetime(),
})
export type PreviewAccess = z.infer<typeof previewAccessSchema>
export const previewAccessFromResult = (result: {
  _meta?: Record<string, unknown>
}) => {
  const parsed = previewAccessSchema.safeParse(
    result._meta?.[PREVIEW_ACCESS_META],
  )
  return parsed.success ? parsed.data : null
}
