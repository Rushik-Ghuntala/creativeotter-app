import { NextResponse, type NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/auth/redirects"
import { getAppUrl } from "@/lib/env"

export const GET = async (request: NextRequest) => {
  const code = request.nextUrl.searchParams.get("code")
  if (code) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error)
      return NextResponse.redirect(
        new URL(
          safeNextPath(request.nextUrl.searchParams.get("next")),
          getAppUrl(),
        ),
      )
  }
  return NextResponse.redirect(
    new URL("/auth/login?error=invalid_link", getAppUrl()),
  )
}
