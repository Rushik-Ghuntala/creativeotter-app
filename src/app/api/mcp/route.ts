import { handleMcpRequest } from "@/lib/mcp/handler"

export const maxDuration = 60
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const POST = handleMcpRequest
export const GET = handleMcpRequest
export const DELETE = handleMcpRequest
export const OPTIONS = handleMcpRequest
