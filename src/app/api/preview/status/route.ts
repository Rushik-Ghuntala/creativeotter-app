import { handlePreviewStatus } from "@/lib/mcp/preview-status-handler"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
export const POST = (request: Request) => handlePreviewStatus(request)
export const OPTIONS = (request: Request) => handlePreviewStatus(request)
