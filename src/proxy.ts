import type { NextRequest } from "next/server"
import { refreshWebSession } from "@/lib/supabase/proxy"

export const proxy = (request: NextRequest) => refreshWebSession(request)

export const config = {
  matcher: ["/auth/:path*", "/dashboard/:path*", "/oauth/:path*"],
}
