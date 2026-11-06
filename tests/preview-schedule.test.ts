import test from "node:test"
import assert from "node:assert/strict"
import {
  signedUrlExpiresAt,
  nextPreviewRefreshAt,
  shouldRefreshPreview,
} from "@/lib/mcp/preview-schedule"
import { generationSnapshotSchema } from "@/lib/media/contracts"
import { refreshGenerationStatus } from "@/lib/mcp/preview-refresh"
const now = 1793827800000
const id = "2192a7f9-46d2-49c7-8351-0394e29e982f"
const url = (exp: number) =>
  `https://storage.invalid/object?token=x.${Buffer.from(JSON.stringify({ exp: exp / 1000 })).toString("base64url")}.x`
const snapshot = generationSnapshotSchema.parse({
  generation_id: id,
  execution_source: "provider",
  quote_id: id,
  job_id: id,
  model: "native:image",
  model_name: "Saved image",
  host_name: null,
  state: "succeeded",
  input: { prompt: "Existing", reference_asset_ids: [] },
  max_cost_micro_usd: null,
  credit_units: "16000",
  credit_status: "charged",
  estimated_cost_label: "Saved",
  pricing_version: null,
  expires_at: null,
  review_url: null,
  job_url: "https://creativeotter-app.vercel.app/studio/jobs/" + id,
  references: [],
  outputs: [
    {
      id,
      label: "Saved",
      url: url(now + 3600000),
      download_url: url(now + 3600000),
      mime_type: "image/png",
      width: 928,
      height: 1152,
      favorite: false,
    },
  ],
  error: null,
  message: "Saved",
})

test("saved image refresh is scheduled before private links AND scoped access expire", () => {
  const access = {
    url: "https://creativeotter-app.vercel.app/api/preview/status",
    token: "fixture",
    expires_at: new Date(now + 900000).toISOString(),
  }
  assert.equal(nextPreviewRefreshAt(snapshot, access, now), now + 840000)
  assert.equal(nextPreviewRefreshAt(snapshot, null, now), now + 2700000)
  assert.ok(nextPreviewRefreshAt(snapshot, access, now + 900000) > now + 900000)
  const stale = {
    ...snapshot,
    outputs: [{ ...snapshot.outputs[0], download_url: url(now - 1000) }],
  }
  assert.ok(nextPreviewRefreshAt(stale, null, now) < now)
  assert.equal(signedUrlExpiresAt("not-a-url"), null)
  assert.equal(signedUrlExpiresAt("https://example.com/image.png"), null)
})

test("HTTP renewal updates hidden access while returning only the same saved image", async () => {
  const access = {
    url: "https://creativeotter-app.vercel.app/api/preview/status",
    token: "fixture",
    expires_at: new Date(Date.now() + 600000).toISOString(),
  }
  const renewed = {
    ...access,
    token: "renewed",
    expires_at: new Date(Date.now() + 900000).toISOString(),
  }
  let accepted: unknown = null
  const bridge = {
    getHostContext: () => undefined,
    callServerTool: async () => {
      throw new Error("Unavailable")
    },
    readServerResource: async () => {
      throw new Error("Unavailable")
    },
  }
  const read = await refreshGenerationStatus(
    bridge,
    snapshot,
    access,
    async () =>
      Response.json({
        ...snapshot,
        _meta: { "creativeotter/preview-access": renewed },
      }),
    (value) => {
      accepted = value
    },
  )
  assert.deepEqual(accepted, renewed)
  assert.equal(read.generation_id, id)
  assert.equal(read.credit_status, "charged")
  assert.equal("_meta" in read, false)
})

test("a failed refresh retries on its backoff even while the previous URL is still fresh", () => {
  const scheduled = now + 45 * 60 * 1000
  const retry = now + 60 * 1000
  assert.equal(shouldRefreshPreview(now, retry, scheduled), false)
  assert.equal(shouldRefreshPreview(retry, retry, scheduled), true)
  assert.equal(shouldRefreshPreview(retry, 0, scheduled), false)
  assert.equal(shouldRefreshPreview(scheduled, 0, scheduled), true)
  assert.equal(
    shouldRefreshPreview(scheduled + 1000, Infinity, scheduled),
    false,
  )
})
