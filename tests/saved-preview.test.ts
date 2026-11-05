import test, { after } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  createSavedPreviewAccess,
  isSavedPreviewToken,
} from "@/lib/mcp/saved-preview"
import { handlePreviewStatus } from "@/lib/mcp/preview-status-handler"
import {
  refreshGenerationStatus,
  isPreviewAccessRemoved,
} from "@/lib/mcp/preview-refresh"
import { generationSnapshotSchema } from "@/lib/media/contracts"
const oldUrl = process.env.NEXT_PUBLIC_APP_URL
process.env.NEXT_PUBLIC_APP_URL = "https://creativeotter-app.vercel.app"
after(() => {
  if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = oldUrl
})
const id = "2192a7f9-46d2-49c7-8351-0394e29e982f"
const ref = { generation_id: id, execution_source: "provider" as const }
const snapshot = generationSnapshotSchema.parse({
  generation_id: id,
  execution_source: "provider",
  quote_id: id,
  job_id: id,
  model: "image/nano-banana-2",
  model_name: "Nano Banana 2",
  host_name: null,
  state: "succeeded",
  input: { prompt: "Existing saved image" },
  max_cost_micro_usd: "80000",
  credit_units: "16000",
  credit_status: "charged",
  estimated_cost_label: "$0.08",
  pricing_version: "fixture",
  expires_at: null,
  review_url: null,
  job_url: "https://creativeotter-app.vercel.app/studio/jobs/" + id,
  references: [],
  outputs: [],
  error: null,
  message: "Saved",
})
const token = "sp1." + "a".repeat(43)
const request = (
  body: unknown = ref,
  credential = token,
  origin = "https://fixture.claudemcpcontent.com",
) =>
  new Request("https://creativeotter-app.vercel.app/api/preview/status", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + credential,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

test("saved preview stores only a hash, is image-scoped and never contains an OAuth token", async () => {
  let args: Record<string, unknown> = {}
  const client = {
    rpc: async (name: string, value: Record<string, unknown>) => {
      assert.equal(name, "create_saved_preview")
      args = value
      return { data: id, error: null }
    },
  }
  const access = await createSavedPreviewAccess(
    client as unknown as Parameters<typeof createSavedPreviewAccess>[0],
    id,
    [ref],
  )
  assert.ok(isSavedPreviewToken(access.token))
  assert.equal(access.expires_at, null)
  assert.equal(
    args.secret_hash,
    createHash("sha256").update(access.token).digest("hex"),
  )
  assert.deepEqual(args.generations, [ref])
  assert.ok(!JSON.stringify(args).includes(access.token))
})

test("persistent status survives original sign-in expiry while every read still goes through the scoped DB authorization", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() })
  let reads = 0,
    revoked = false
  const deps: NonNullable<Parameters<typeof handlePreviewStatus>[1]> = {
    authenticate: async () => {
      throw new Error("Saved previews must not reuse an expired OAuth token")
    },
    readStatus: async () => {
      throw new Error("No provider reconciliation or generation")
    },
    readSaved: async (secret, reference) => {
      assert.equal(secret, token)
      assert.deepEqual(reference, ref)
      reads++
      if (revoked) throw new Error("Revoked grant")
      return snapshot
    },
  }
  assert.equal((await handlePreviewStatus(request(), deps)).status, 200)
  t.mock.timers.tick(8 * 60 * 60 * 1000)
  const afterExpiry = await handlePreviewStatus(request(), deps)
  assert.equal(afterExpiry.status, 200)
  assert.equal((await afterExpiry.json()).generation_id, id)
  revoked = true
  assert.equal((await handlePreviewStatus(request(), deps)).status, 403)
  assert.equal(
    (await handlePreviewStatus(request({ ...ref, action: "generate" }), deps))
      .status,
    400,
  )
  assert.equal(
    (
      await handlePreviewStatus(
        request(ref, token, "https://attacker.invalid"),
        deps,
      )
    ).status,
    403,
  )
  assert.equal(reads, 3)
})

test("existing-image HTTP refresh accepts persistent scope without cookies, URL credentials or a clock-expiry gate", async () => {
  let calls = 0
  const access = {
    url: "https://creativeotter-app.vercel.app/api/preview/status",
    token,
    expires_at: null,
  }
  const result = await refreshGenerationStatus(
    {
      getHostContext: () => undefined,
      callServerTool: async () => {
        throw new Error("IPC unavailable")
      },
      readServerResource: async () => {
        throw new Error("IPC unavailable")
      },
    },
    snapshot,
    access,
    async (url, options) => {
      calls++
      assert.equal(String(url), access.url)
      assert.equal(options?.credentials, "omit")
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        "Bearer " + token,
      )
      assert.deepEqual(JSON.parse(String(options?.body)), ref)
      return Response.json(snapshot)
    },
  )
  assert.equal(result.generation_id, id)
  assert.equal(calls, 1)
})

test("revoked saved access stops renewal; temporary transport errors remain retryable", async () => {
  const bridge = {
    getHostContext: () => undefined,
    callServerTool: async () => {
      throw new Error("No host calls for saved capability")
    },
    readServerResource: async () => {
      throw new Error("No host calls for saved capability")
    },
  }
  const access = {
    url: "https://creativeotter-app.vercel.app/api/preview/status",
    token,
    expires_at: null,
  }
  for (const status of [403, 503]) {
    await assert.rejects(
      () =>
        refreshGenerationStatus(
          bridge,
          snapshot,
          access,
          async () => new Response(null, { status }),
        ),
      (error: unknown) => {
        assert.equal(isPreviewAccessRemoved(error), status === 403)
        return true
      },
    )
  }
})
