import { getProtectedResourceMetadata } from "@/lib/mcp/metadata"

export const dynamic = "force-dynamic"
export const GET = () =>
  Response.json(getProtectedResourceMetadata(), {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  })
