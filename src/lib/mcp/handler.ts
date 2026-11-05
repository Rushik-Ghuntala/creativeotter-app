import "server-only"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { authenticateMcp } from "@/lib/mcp/auth"
import { createCreativeOtterMcp } from "@/lib/mcp/server"
import { getAuthChallenge, isAllowedMcpOrigin } from "@/lib/mcp/metadata"
import { getAppUrl } from "@/lib/env"

type Dependencies = { authenticate: typeof authenticateMcp }
const dependencies: Dependencies = { authenticate: authenticateMcp }

export const handleMcpRequest = async (
  request: Request,
  deps: Dependencies = dependencies,
) => {
  const origin = request.headers.get("origin")
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" })
  if (!isAllowedMcpOrigin(origin))
    return Response.json(
      { error: "Origin is not allowed" },
      { status: 403, headers },
    )
  if (origin) headers.set("Access-Control-Allow-Origin", origin)
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept, MCP-Protocol-Version",
  )
  headers.set("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS")
  headers.set("Access-Control-Expose-Headers", "WWW-Authenticate")
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers })
  const auth = await deps.authenticate(request)
  if (!auth) {
    headers.set(
      "WWW-Authenticate",
      getAuthChallenge(
        request.headers.has("authorization") ? "invalid_token" : undefined,
      ),
    )
    return Response.json(
      { error: "Sign in with your CreativeOtter OAuth connection" },
      { status: 401, headers },
    )
  }
  // RLS and this RPC recheck the current grant and membership on every request.
  const { data: context, error } = await auth.supabase.rpc("get_mcp_context")
  if (error || !context) {
    const denied =
      (!error && !context) ||
      error?.code === "42501" ||
      error?.code === "PGRST301"
    // An issued token whose app grant was revoked needs a new authorization.
    // A bare 403 leaves MCP hosts unable to offer their sign-in flow.
    if (denied)
      headers.set("WWW-Authenticate", getAuthChallenge("invalid_token"))
    return Response.json(
      {
        error: denied
          ? "Workspace permission is missing or revoked. Reconnect through CreativeOtter."
          : "Workspace access is temporarily unavailable",
      },
      { status: denied ? 401 : 503, headers },
    )
  }
  if (
    context.user_id !== auth.actor.sub ||
    context.client_id !== auth.actor.client_id
  ) {
    return Response.json(
      { error: "Invalid workspace context" },
      { status: 403, headers },
    )
  }
  if (request.method !== "POST") {
    headers.set("Allow", "POST, OPTIONS")
    return new Response(null, { status: 405, headers })
  }
  const server = createCreativeOtterMcp(
    context,
    getAppUrl(),
    auth.actor.email ?? null,
    auth.supabase,
    auth.token,
  )
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 65536,
  })
  try {
    await server.connect(transport)
    const response = await transport.handleRequest(request, {
      authInfo: {
        token: auth.token,
        clientId: context.client_id,
        scopes: ["email"],
        resource: new URL(`${getAppUrl()}/api/mcp`),
      },
    })
    headers.forEach((value, key) => response.headers.set(key, value))
    return response
  } finally {
    await server.close()
  }
}
