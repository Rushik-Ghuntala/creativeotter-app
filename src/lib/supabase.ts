import "server-only"
import { createClient } from "@supabase/supabase-js"
import { getPublicEnv } from "@/lib/env"
import type { Database } from "@/lib/database.types"

// Trusted maintenance only. Web and MCP requests use the user's RLS-scoped client.
export const createAdminSupabase = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("Supabase service-role configuration is missing")
  return createClient<Database>(getPublicEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
