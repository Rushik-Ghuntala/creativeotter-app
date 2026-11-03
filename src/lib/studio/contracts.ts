import { formatCreditUnits } from "@/lib/credits/contracts"
import { z } from "zod"

const name = z.string().trim().min(1).max(80)
const assetId = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.uuid().nullable(),
)
const base = { name, description: z.string().trim().max(4000).default("") }
export const brandKitSchema = z
  .object({
    ...base,
    colors: z
      .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
      .max(12)
      .default([]),
    font_family: z.string().trim().max(100).default(""),
    tone: z.string().trim().max(500).default(""),
    logo_asset_id: assetId,
  })
  .strict()
export const characterSchema = z
  .object({
    ...base,
    appearance: z.string().trim().max(4000).default(""),
    identity_type: z
      .enum(["fictional", "self", "authorized"])
      .default("fictional"),
    reference_asset_id: assetId,
  })
  .strict()
export const projectSchema = z
  .object({
    ...base,
    description: z.string().trim().max(8000).default(""),
    kind: z.enum(["campaign", "film", "music"]).default("campaign"),
    status: z.enum(["draft", "active", "complete"]).default("draft"),
    budget_target_units: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z
        .string()
        .regex(/^\d{1,13}$/)
        .refine((v) => BigInt(v) <= BigInt(1000000000000))
        .nullable(),
    ),
    aspect_ratio: z.enum(["1:1", "4:5", "16:9", "9:16"]).default("9:16"),
    genre: z.string().trim().max(80).default(""),
    lyrics: z.string().max(8000).default(""),
  })
  .strict()
export const voicePresetSchema = z
  .object({
    ...base,
    language: z.string().trim().min(2).max(40).default("en-US"),
    script: z.string().max(8000).default(""),
    style: z.string().max(500).default(""),
  })
  .strict()
export const shotSchema = z
  .object({
    project_id: z.uuid(),
    position: z.number().int().min(1).max(1000),
    prompt: z.string().trim().min(1).max(4000),
    narration: z.string().max(4000).default(""),
    duration_seconds: z.number().int().min(1).max(120).default(5),
    reference_asset_id: assetId,
  })
  .strict()
export const sectionSchema = z.enum([
  "characters",
  "films",
  "voices",
  "music",
  "projects",
  "brands",
])
export type StudioSection = z.infer<typeof sectionSchema>
export type BrandKit = z.infer<typeof brandKitSchema> & RecordFields
export type StudioCharacter = z.infer<typeof characterSchema> & RecordFields
export type StudioProject = Omit<
  z.infer<typeof projectSchema>,
  "budget_target_units"
> &
  RecordFields & { budget_target_units: number | null }
export type VoicePreset = z.infer<typeof voicePresetSchema> & RecordFields
export type StudioShot = z.infer<typeof shotSchema> & {
  id: string
  workspace_id: string
  created_at: string
}
export type ProjectAsset = {
  workspace_id: string
  project_id: string
  asset_id: string
  created_at: string
}
export type RecordFields = {
  id: string
  workspace_id: string
  archived_at: string | null
  created_at: string
  updated_at: string
}
export type StudioRecord =
  StudioCharacter | StudioProject | BrandKit | VoicePreset
export type WorkspacePreferences = {
  workspace_id: string
  video_mode: "review" | "auto"
  updated_at: string
}
export type WorkspaceInvite = {
  id: string
  workspace_id: string
  email: string
  role: "creator" | "viewer"
  token_hash: string
  created_by: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}
export type SupportRequest = {
  id: string
  workspace_id: string
  user_id: string
  category: "support" | "deletion"
  message: string
  status: "open" | "in_progress" | "resolved"
  created_at: string
}
export type ActionState = {
  error?: string
  message?: string
  invitation_url?: string
}
export const sectionTable = {
  characters: "studio_characters",
  films: "studio_projects",
  projects: "studio_projects",
  music: "studio_projects",
  voices: "studio_voice_presets",
  brands: "brand_kits",
} as const
export const parseRecordInput = (section: StudioSection, input: unknown) => {
  if (section === "characters") return characterSchema.parse(input)
  if (section === "brands") return brandKitSchema.parse(input)
  if (section === "voices") return voicePresetSchema.parse(input)
  const value = projectSchema.parse(input)
  const expected =
    section === "films" ? "film" : section === "music" ? "music" : "campaign"
  if (value.kind !== expected)
    throw new Error("Project type does not match this section")
  return value
}
export const creditsToUnits = (value: string) => {
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(value))
    throw new Error("Use a positive credit amount with at most three decimals")
  const [whole, fraction = ""] = value.split(".")
  return (
    BigInt(whole) * BigInt(1000) +
    BigInt(fraction.padEnd(3, "0"))
  ).toString()
}
export const unitsToCredits = (value: string | number | null | undefined) =>
  formatCreditUnits(String(value ?? 0))
