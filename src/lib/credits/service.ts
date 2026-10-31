import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { creditSummarySchema } from "@/lib/credits/contracts"

export const getCreditSummary = async (
  client: SupabaseClient<Database>,
  workspaceId: string,
) => {
  const result = await client.rpc("get_credit_summary", {
    target_workspace: workspaceId,
  })
  const parsed = creditSummarySchema.safeParse(result.data)
  return result.error || !parsed.success ? null : parsed.data
}
