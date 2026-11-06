import { z } from "zod"

export const RENDER_BUCKET = "creativeotter-renders"
export const renderInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    format: z.enum(["png", "mp4"]),
    html: z.string().max(24000).default(""),
    css: z.string().max(12000).default(""),
    width: z
      .number()
      .int()
      .min(128)
      .max(1920)
      .refine((n) => n % 2 === 0),
    height: z
      .number()
      .int()
      .min(128)
      .max(1920)
      .refine((n) => n % 2 === 0),
    duration_seconds: z.number().int().min(1).max(30).default(4),
    fps: z
      .union([z.literal(12), z.literal(24), z.literal(25), z.literal(30)])
      .default(24),
    asset_ids: z.array(z.uuid()).max(4).default([]),
    engine: z.enum(["css", "hyperframes"]).optional(),
    revision_id: z.uuid().optional(),
  })
  .strict()
export type RenderInput = z.infer<typeof renderInputSchema>
export type RenderJob = {
  id: string
  workspace_id: string
  user_id: string
  client_id: string | null
  request_key: string
  input: RenderInput
  state: "quoted" | "queued" | "running" | "saving" | "succeeded" | "failed"
  credit_units: number
  pricing_version: string
  expires_at: string
  lease_id: string | null
  lease_until: string | null
  storage_path: string | null
  size_bytes: number | null
  sha256: string | null
  created_at: string
  updated_at: string
}
export const renderSnapshotSchema = z.object({
  render_id: z.uuid(),
  title: z.string(),
  format: z.enum(["png", "mp4"]),
  state: z.enum([
    "quoted",
    "queued",
    "running",
    "saving",
    "succeeded",
    "failed",
  ]),
  credit_units: z.string().regex(/^\d+$/),
  credit_status: z.enum(["quoted", "reserved", "charged", "released"]),
  width: z.number(),
  height: z.number(),
  duration_seconds: z.number(),
  preview_url: z.url().nullable(),
  download_url: z.url().nullable(),
  urls_expire_at: z.string().nullable(),
  saved: z.boolean(),
  project_url: z.url().optional(),
  message: z.string(),
})
export type RenderSnapshot = z.infer<typeof renderSnapshotSchema>
export type RenderAccess = { url: string; token: string }
export const renderingEnabled = () =>
  process.env.CREATIVEOTTER_RENDERING_ENABLED === "true"
