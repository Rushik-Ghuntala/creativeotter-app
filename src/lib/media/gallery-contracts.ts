import { z } from "zod"
import { generationSnapshotSchema } from "@/lib/media/contracts"

export const galleryRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120).default("Your images"),
    generations: z
      .array(
        z
          .object({
            generation_id: z.uuid(),
            execution_source: z.enum(["native", "provider"]),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()
  .refine(
    (value) =>
      new Set(
        value.generations.map(
          (item) => `${item.execution_source}:${item.generation_id}`,
        ),
      ).size === value.generations.length,
    "Each image request must appear only once",
  )

export const gallerySnapshotSchema = z.object({
  view: z.literal("gallery"),
  title: z.string(),
  items: z.array(generationSnapshotSchema).min(1).max(20),
  total_charged_units: z.string().regex(/^\d+$/),
  gallery_url: z.url().optional(),
  message: z.string(),
})
export type GalleryRequest = z.infer<typeof galleryRequestSchema>
export type GallerySnapshot = z.infer<typeof gallerySnapshotSchema>

export const buildGalleryUrl = (appUrl: string, request: GalleryRequest) => {
  const input = galleryRequestSchema.parse(request)
  const url = new URL("/studio/gallery", appUrl)
  url.searchParams.set(
    "items",
    input.generations
      .map((item) => `${item.execution_source}:${item.generation_id}`)
      .join(","),
  )
  url.searchParams.set("title", input.title)
  return url.toString()
}

export const parseGalleryQuery = (
  query: Record<string, string | string[] | undefined>,
): GalleryRequest => {
  const items = z.string().min(1).max(2000).parse(query.items)
  return galleryRequestSchema.parse({
    title: query.title,
    generations: items.split(",").map((value) => {
      const parts = value.split(":")
      if (parts.length !== 2) throw new Error("Invalid gallery image reference")
      return { execution_source: parts[0], generation_id: parts[1] }
    }),
  })
}
