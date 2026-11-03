import "server-only"
import { cache } from "react"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { getPublicEnv } from "@/lib/env"
import type { Database } from "@/lib/database.types"

export const createServerSupabase = cache(async () => {
  const store = await cookies()
  const env = getPublicEnv()
  return createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          )
        } catch {
          // Server Components cannot write cookies; the proxy performs refreshes.
        }
      },
    },
  })
})
