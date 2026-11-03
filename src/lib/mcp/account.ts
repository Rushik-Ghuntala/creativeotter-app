import { z } from "zod"
import { creditSummarySchema } from "@/lib/credits/contracts"
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
  balance: creditSummarySchema.nullable(),
  billing_status: z.enum(["not_implemented", "credits_ready"]),
  generation_mode: z.literal("direct"),
  media_generation: z.boolean(),
  uploads: z.boolean(),
  native_output_import: z.boolean(),
  execution_policy: z.literal("native_first"),
  activity: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      state: z.string(),
      source: z.enum(["native", "provider"]),
      created_at: z.string(),
    }),
  ),
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
  account_url: `${appUrl}/account${section === "settings" ? "?tab=settings" : section === "activity" ? "?tab=billing" : ""}`,
  balance: null,
  billing_status: "not_implemented",
  generation_mode: "direct",
  media_generation: false,
  uploads: false,
  native_output_import: false,
  execution_policy: "native_first",
  activity: [],
  message:
    section === "activity"
      ? "Saved native images and provider requests appear when media library access is enabled. Credit purchases are not enabled."
      : "Connected to your CreativeOtter workspace. Use suitable native host tools first; provider fallback requires configuration and sufficient credits.",
})
