import { z } from "zod"
import type { McpContext } from "@/lib/database.types"

export const accountSectionSchema = z.enum(["overview", "activity", "settings"])
export const accountSnapshotSchema = z.object({
  section: accountSectionSchema,
  user_id: z.string(),
  client_id: z.string(),
  email: z.string().nullable(),
  workspace: z.object({ id: z.string(), name: z.string() }),
  role: z.enum(["owner", "admin", "creator", "viewer"]),
  permissions: z.array(z.string()),
  account_url: z.url(),
  balance: z.null(),
  billing_status: z.literal("not_implemented"),
  generation_mode: z.literal("review"),
  media_generation: z.literal(false),
  uploads: z.literal(false),
  message: z.string(),
})

export type AccountSnapshot = z.infer<typeof accountSnapshotSchema>
export type AccountSection = z.infer<typeof accountSectionSchema>

export const createAccountSnapshot = (
  context: McpContext,
  appUrl: string,
  section: AccountSection,
  email: string | null,
): AccountSnapshot => ({
  section,
  user_id: context.user_id,
  client_id: context.client_id,
  email,
  workspace: context.workspace,
  role: context.role,
  permissions: context.permissions,
  account_url: `${appUrl}/dashboard`,
  balance: null,
  billing_status: "not_implemented",
  generation_mode: "review",
  media_generation: false,
  uploads: false,
  message:
    section === "activity"
      ? "Credit and generation history will appear when billing and media generation become available."
      : "Connected to your CreativeOtter workspace with read-only account access.",
})
