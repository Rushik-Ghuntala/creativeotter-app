import test from "node:test"
import assert from "node:assert/strict"
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { safeNextPath } from "@/lib/auth/redirects"
import { extractBearerToken, verifyMcpToken } from "@/lib/mcp/token"
import { createCreativeOtterMcp } from "@/lib/mcp/server"
import { isSupportedConsentScope } from "@/lib/oauth/scopes"

const issuer = "https://auth.creativeotter.invalid/auth/v1"
const resource = "https://creativeotter-app.vercel.app/api/mcp"
const subject = "10000000-0000-4000-8000-000000000001"

test("consent supports refresh-token access without granting unrelated identity scopes", () => {
  assert.equal(isSupportedConsentScope("email offline_access"), true)
  assert.equal(isSupportedConsentScope("openid profile email"), true)
  assert.equal(isSupportedConsentScope("email phone"), false)
  assert.equal(isSupportedConsentScope("account:write"), false)
})

test("post-login redirects stay on the application origin", () => {
  for (const value of [
    "https://attacker.test",
    "//attacker.test",
    "/\\attacker.test",
    "/\n/attacker.test",
    null,
  ])
    assert.equal(safeNextPath(value), "/dashboard")
  assert.equal(
    safeNextPath("/oauth/consent?authorization_id=abc"),
    "/oauth/consent?authorization_id=abc",
  )
})

test("MCP accepts only signed, unexpired OAuth tokens bound to this resource", async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256")
  const key = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid: "test", alg: "ES256" }],
  })
  const sign = (
    aud: string | string[],
    clientId?: string,
    expiry = "5m",
    tokenIssuer = issuer,
  ) =>
    new SignJWT({
      role: "authenticated",
      ...(clientId ? { client_id: clientId } : {}),
    })
      .setProtectedHeader({ alg: "ES256", kid: "test" })
      .setSubject(subject)
      .setIssuer(tokenIssuer)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(expiry)
      .sign(privateKey)
  const valid = await sign(["authenticated", resource], "approved-client")
  assert.equal(
    (await verifyMcpToken(valid, key, issuer, resource)).client_id,
    "approved-client",
  )
  await assert.rejects(() =>
    verifyMcpToken(valid + "broken", key, issuer, resource),
  )
  for (const token of [
    await sign("authenticated", "client"),
    await sign(resource),
    await sign(resource, "client", "-1s"),
    await sign(resource, "client", "5m", "https://wrong-issuer.test"),
  ]) {
    await assert.rejects(() => verifyMcpToken(token, key, issuer, resource))
  }
  assert.equal(extractBearerToken(null), null)
  assert.equal(extractBearerToken("Basic password"), null)
  assert.equal(extractBearerToken(`Bearer ${valid}`), valid)
})

test("stateless MCP tools expose real account context and no paid capabilities", async () => {
  const context = {
    user_id: subject,
    client_id: "test-client",
    workspace: { id: subject, name: "Test workspace" },
    role: "owner" as const,
    permissions: ["account:read"],
  }
  const call = async (method: string, params: object = {}) => {
    const server = createCreativeOtterMcp(
      context,
      "https://creativeotter-app.vercel.app",
    )
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    try {
      const response = await transport.handleRequest(
        new Request(resource, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
      )
      assert.equal(response.status, 200)
      return await response.json()
    } finally {
      await server.close()
    }
  }
  const tools = await call("tools/list")
  assert.deepEqual(
    tools.result.tools.map((tool: { name: string }) => tool.name).sort(),
    ["get_capabilities", "manage_account"],
  )
  const account = await call("tools/call", {
    name: "manage_account",
    arguments: { section: "overview" },
  })
  assert.equal(account.result.structuredContent.workspace.id, subject)
  assert.equal(account.result.structuredContent.balance, null)
  const capabilities = await call("tools/call", {
    name: "get_capabilities",
    arguments: {},
  })
  assert.equal(capabilities.result.structuredContent.media_generation, false)
})
