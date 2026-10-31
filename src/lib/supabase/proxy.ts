import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getPublicEnv } from "@/lib/env"

export const refreshWebSession = async (request: NextRequest) => {
  let response = NextResponse.next({ request })
  const env = getPublicEnv()
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })
  // Validate/refresh, but authorize again in each page, action and MCP request.
  await supabase.auth.getUser()
  response.headers.set("Cache-Control", "private, no-store")
  response.headers.set("Referrer-Policy", "same-origin")
  return response
}
