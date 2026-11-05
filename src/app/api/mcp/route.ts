import { handleMcpRequest } from "@/lib/mcp/handler"

export const maxDuration = 60
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const POST = (request: Request) => handleMcpRequest(request)
export const GET = (request: Request) => handleMcpRequest(request)
export const DELETE = (request: Request) => handleMcpRequest(request)
export const OPTIONS = (request: Request) => handleMcpRequest(request)
