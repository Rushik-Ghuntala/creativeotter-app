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
  message: z.string(),
})
export type GalleryRequest = z.infer<typeof galleryRequestSchema>
export type GallerySnapshot = z.infer<typeof gallerySnapshotSchema>
