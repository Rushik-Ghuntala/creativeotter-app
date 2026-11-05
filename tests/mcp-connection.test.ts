import test from "node:test"
import assert from "node:assert/strict"
import { handleMcpRequest } from "@/lib/mcp/handler"
import { getConsentFailure } from "@/lib/oauth/consent-failure"

type Authenticate = NonNullable<
  Parameters<typeof handleMcpRequest>[1]
>["authenticate"]
const resource = "https://creativeotter-app.vercel.app/api/mcp"
const id = "10000000-0000-4000-8000-000000000001"
const request = (token?: string, origin?: string) =>
  new Request(resource, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
  })
const authWithContext =
  (data: unknown, error: unknown = null): Authenticate =>
  async () =>
    ({
      actor: {
        sub: id,
        client_id: "fixture-client",
        role: "authenticated",
        exp: 9999999999,
      },
      token: "fixture-token",
      supabase: { rpc: async () => ({ data, error }) },
    }) as unknown as Awaited<ReturnType<Authenticate>>

test("missing and expired tokens offer MCP OAuth sign-in without a redirect", async () => {
  for (const token of [undefined, "expired-fixture-token"]) {
    const response = await handleMcpRequest(request(token), {
      authenticate: async () => null,
    })
    assert.equal(response.status, 401)
    assert.match(
      response.headers.get("www-authenticate")!,
      /oauth-protected-resource/,
    )
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.equal(response.headers.has("location"), false)
    assert.equal(
      response.headers
        .get("www-authenticate")!
        .includes('error="invalid_token"'),
      !!token,
    )
  }
})

test("a missing or revoked workspace grant asks the host to reconnect and reveals no account data", async () => {
  for (const error of [null, { code: "42501" }, { code: "PGRST301" }]) {
    const response = await handleMcpRequest(request("fixture-token"), {
      authenticate: authWithContext(null, error),
    })
    assert.equal(response.status, 401)
    assert.match(response.headers.get("www-authenticate")!, /invalid_token/)
    assert.match((await response.json()).error, /Reconnect/)
  }
})

test("temporary workspace failures and wrong client context do not trigger sign-in loops", async () => {
  const unavailable = await handleMcpRequest(request("fixture-token"), {
    authenticate: authWithContext(null, { code: "08006" }),
  })
  assert.equal(unavailable.status, 503)
  assert.equal(unavailable.headers.has("www-authenticate"), false)
  const wrongClient = await handleMcpRequest(request("fixture-token"), {
    authenticate: authWithContext({ user_id: id, client_id: "another-client" }),
  })
  assert.equal(wrongClient.status, 403)
  assert.equal(wrongClient.headers.has("www-authenticate"), false)
})

test("connection repair retains origin protection", async () => {
  let authenticated = false
  const response = await handleMcpRequest(
    request("fixture-token", "https://untrusted.invalid"),
    {
      authenticate: async () => {
        authenticated = true
        return null
      },
    },
  )
  assert.equal(response.status, 403)
  assert.equal(authenticated, false)
})

test("consent failures distinguish unsupported scope, expired request and retryable completion failure", () => {
  assert.match(getConsentFailure("scope").title, /unsupported access/)
  assert.match(getConsentFailure("expired").title, /expired/)
  assert.equal(getConsentFailure("failed").retry, true)
  assert.equal(getConsentFailure("scope").retry, false)
  assert.equal(getConsentFailure(["failed"]).retry, false)
})

test("live account-only connections expose account tools and media consent enables discovery", async (t) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-public-key"
  t.after(() => {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    if (previousKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey
  })
  for (const media of [false, true]) {
    const response = await handleMcpRequest(
      new Request(resource, {
        method: "POST",
        headers: {
          Authorization: "Bearer fixture-token",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      }),
      {
        authenticate: authWithContext({
          user_id: id,
          client_id: "fixture-client",
          workspace: { id, name: "Fixture" },
          role: "owner",
          permissions: media
            ? ["account:read", "media:read", "media:prepare"]
            : ["account:read"],
        }),
      },
    )
    assert.equal(response.status, 200)
    const names = (await response.json()).result.tools
      .map((tool: { name: string }) => tool.name)
      .sort()
    if (media) {
      assert.ok(names.includes("prepare_native_generation"))
      assert.ok(names.includes("show_image_gallery"))
    } else assert.deepEqual(names, ["get_capabilities", "manage_account"])
  }
})
