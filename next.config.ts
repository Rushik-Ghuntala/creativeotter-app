import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  distDir: process.env.CREATIVEOTTER_LOCAL_DIST_DIR || ".next",
  outputFileTracingIncludes: {
    "/api/mcp": [
      "./src/lib/mcp/ui/dist/render.html",
      "./src/lib/mcp/ui/dist/account.html",
      "./src/lib/mcp/ui/dist/generation.html",
    ],
  },
  headers: async () => [
    {
      source: "/oauth/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "Referrer-Policy", value: "same-origin" },
      ],
    },
  ],
}
export default nextConfig
