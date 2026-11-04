import test, { after } from "node:test"
import assert from "node:assert/strict"
import {
  createPreviewAccess,
  decryptPreviewAccess,
} from "@/lib/mcp/preview-access"
import {
  handlePreviewStatus,
  isPreviewOriginAllowed,
} from "@/lib/mcp/preview-status-handler"
import { generationSnapshotSchema } from "@/lib/media/contracts"
import { refreshGenerationStatus } from "@/lib/mcp/preview-refresh"

const savedEnv = {
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  url: process.env.NEXT_PUBLIC_APP_URL,
}
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only-preview-encryption-key"
process.env.NEXT_PUBLIC_APP_URL = "https://creativeotter-app.vercel.app"
after(() => {
  for (const [name, value] of [
    ["SUPABASE_SERVICE_ROLE_KEY", savedEnv.key],
    ["NEXT_PUBLIC_APP_URL", savedEnv.url],
  ]) {
    if (value === undefined) delete process.env[name!]
    else process.env[name!] = value
  }
})
const id = "2192a7f9-46d2-49c7-8351-0394e29e982f"
const ref = { generation_id: id, execution_source: "provider" as const }
const context = {
  user_id: id,
  client_id: "fixture-client",
  workspace: { id, name: "Fixture" },
  role: "owner" as const,
  permissions: ["media:read"],
}
const originalToken = "fixture-original-oauth-token"
const snapshot = generationSnapshotSchema.parse({
  generation_id: id,
  execution_source: "provider",
  quote_id: id,
  job_id: "3a49f088-dcb6-4593-929b-23411a344e3c",
  model: "image/nano-banana-2",
  model_name: "Nano Banana 2",
  host_name: null,
  state: "succeeded",
  input: { prompt: "Existing image" },
  max_cost_micro_usd: "80000",
  credit_units: "16000",
  credit_status: "charged",
  estimated_cost_label: "$0.08",
  pricing_version: "fixture",
  expires_at: null,
  review_url: null,
  job_url:
    "https://creativeotter-app.vercel.app/studio/jobs/3a49f088-dcb6-4593-929b-23411a344e3c",
  references: [],
  outputs: [],
  error: null,
  message: "Saved",
})
type Deps = NonNullable<Parameters<typeof handlePreviewStatus>[1]>
const auth = {
  actor: {
    sub: id,
    client_id: context.client_id,
    role: "authenticated" as const,
    exp: Math.floor(Date.now() / 1000) + 600,
  },
  supabase: { rpc: async () => ({ data: context, error: null }) },
  token: originalToken,
} as unknown as NonNullable<Awaited<ReturnType<Deps["authenticate"]>>>
const request = (
  token: string,
  body: unknown = ref,
  origin = "https://fixture.claudemcpcontent.com",
) =>
  new Request("https://creativeotter-app.vercel.app/api/preview/status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  })

test("preview delegation is encrypted, image-scoped, short-lived and tamper-resistant", async () => {
  const access = await createPreviewAccess(originalToken, context, [ref])
  assert.equal(access.token.split(".").length, 5)
  assert.ok(!access.token.includes(originalToken))
  const claims = await decryptPreviewAccess(access.token)
  assert.equal(claims.access_token, originalToken)
  assert.deepEqual(claims.generations, [ref])
  assert.ok(Date.parse(access.expires_at) - Date.now() <= 15 * 60 * 1000)
  assert.ok(Date.parse(access.expires_at) > Date.now())
  const parts = access.token.split(".")
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1)
  await assert.rejects(() => decryptPreviewAccess(parts.join(".")))
})

test("status endpoint rechecks original OAuth and current workspace context before reading", async () => {
  const access = await createPreviewAccess(originalToken, context, [ref])
  let reads = 0,
    authCalls = 0
  const deps: Deps = {
    authenticate: async (req) => {
      authCalls++
      assert.equal(req.headers.get("authorization"), "Bearer " + originalToken)
      return auth
    },
    readStatus: async (_client, workspace, reference) => {
      reads++
      assert.equal(workspace, id)
      assert.deepEqual(reference, ref)
      return snapshot
    },
  }
  const ok = await handlePreviewStatus(request(access.token), deps)
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get("cache-control"), "no-store")
  assert.equal(
    ok.headers.get("access-control-allow-origin"),
    "https://fixture.claudemcpcontent.com",
  )
  assert.equal(ok.headers.get("access-control-allow-credentials"), null)
  assert.equal((await ok.json()).generation_id, id)
  assert.equal(reads, 1)
  assert.equal(authCalls, 1)
  const wrong = {
    ...ref,
    generation_id: "10000000-0000-4000-8000-000000000001",
  }
  assert.equal(
    (await handlePreviewStatus(request(access.token, wrong), deps)).status,
    403,
  )
  assert.equal(
    (
      await handlePreviewStatus(
        request(access.token, { ...ref, action: "generate" }),
        deps,
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await handlePreviewStatus(
        request(access.token, ref, "https://attacker.invalid"),
        deps,
      )
    ).status,
    403,
  )
  assert.equal(reads, 1)
  assert.equal(authCalls, 1)
  const invalidAuth = { ...deps, authenticate: async () => null }
  assert.equal(
    (await handlePreviewStatus(request(access.token), invalidAuth)).status,
    401,
  )
  const revoked = {
    ...auth,
    supabase: { rpc: async () => ({ data: null, error: { code: "42501" } }) },
  } as unknown as typeof auth
  assert.equal(
    (
      await handlePreviewStatus(request(access.token), {
        ...deps,
        authenticate: async () => revoked,
      })
    ).status,
    403,
  )
  const changed = {
    ...auth,
    supabase: {
      rpc: async () => ({
        data: {
          ...context,
          workspace: { id: wrong.generation_id, name: "Other" },
        },
        error: null,
      }),
    },
  } as unknown as typeof auth
  assert.equal(
    (
      await handlePreviewStatus(request(access.token), {
        ...deps,
        authenticate: async () => changed,
      })
    ).status,
    403,
  )
  assert.equal(reads, 1)
})

test("HTTP fallback uses only the approved existing-image endpoint, never cookies or generation tools", async () => {
  const access = await createPreviewAccess(originalToken, context, [ref])
  const calls: string[] = []
  const bridge: Parameters<typeof refreshGenerationStatus>[0] = {
    getHostContext: () => undefined,
    callServerTool: async ({ name }) => {
      calls.push(name)
      throw new Error("IPC not available")
    },
    readServerResource: async () => {
      calls.push("resource")
      throw new Error("IPC not available")
    },
  }
  const fetcher: typeof fetch = async (url, options) => {
    calls.push(String(url))
    assert.equal(options?.credentials, "omit")
    assert.equal(options?.redirect, "error")
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      "Bearer " + access.token,
    )
    assert.deepEqual(JSON.parse(String(options?.body)), ref)
    return Response.json(snapshot)
  }
  const result = await refreshGenerationStatus(
    bridge,
    { ...snapshot, state: "submitted" },
    access,
    fetcher,
  )
  assert.equal(result.state, "succeeded")
  assert.deepEqual(calls, ["check_job", "resource", access.url])
  await assert.rejects(
    () =>
      refreshGenerationStatus(
        bridge,
        snapshot,
        { ...access, url: "https://attacker.invalid/api/preview/status" },
        async () => {
          throw new Error("Must not transmit credential")
        },
      ),
    AggregateError,
  )
  assert.equal(
    isPreviewOriginAllowed("https://claudemcpcontent.com.attacker.invalid"),
    false,
  )
  assert.equal(isPreviewOriginAllowed("null"), true)
})
