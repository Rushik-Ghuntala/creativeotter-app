import test from "node:test"
import assert from "node:assert/strict"
import {
  rememberSavedPreviewAccess,
  restoreSavedPreviewAccess,
  forgetSavedPreviewAccess,
} from "@/lib/mcp/preview-cache"
import { generationSnapshotSchema } from "@/lib/media/contracts"
const id = "2192a7f9-46d2-49c7-8351-0394e29e982f"
const image = generationSnapshotSchema.parse({
  generation_id: id,
  execution_source: "provider",
  quote_id: id,
  job_id: id,
  model: "image/nano-banana-2",
  model_name: "Saved",
  host_name: null,
  state: "succeeded",
  input: { prompt: "Private prompt" },
  max_cost_micro_usd: "80000",
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
      url: "https://storage.invalid/private.png",
      download_url: "https://storage.invalid/download.png",
      mime_type: "image/png",
      width: 928,
      height: 1152,
      favorite: false,
    },
  ],
  error: null,
  message: "Saved",
})
const access = {
  url: "https://creativeotter-app.vercel.app/api/preview/status",
  token: "sp1." + "a".repeat(43),
  expires_at: null,
}
const storage = () => {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}

test("restored gallery recovers only its own persistent capability when the host drops metadata", (t) => {
  const cache = storage()
  assert.deepEqual(restoreSavedPreviewAccess([image], access, cache), access)
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() })
  t.mock.timers.tick(8 * 60 * 60 * 1000)
  assert.deepEqual(restoreSavedPreviewAccess([image], null, cache), access)
  assert.equal(
    restoreSavedPreviewAccess(
      [{ ...image, generation_id: "10000000-0000-4000-8000-000000000001" }],
      null,
      cache,
    ),
    null,
  )
  assert.equal(
    restoreSavedPreviewAccess(
      [{ ...image, job_url: "https://other.invalid/job" }],
      null,
      cache,
    ),
    null,
  )
  const text = JSON.stringify([...cache.values])
  assert.ok(!text.includes(image.input.prompt))
  assert.ok(!text.includes(image.outputs[0].url))
  forgetSavedPreviewAccess([image], cache)
  assert.equal(restoreSavedPreviewAccess([image], null, cache), null)
})

test("private cache never persists OAuth delegations, foreign endpoints or unfinished results", () => {
  const cache = storage()
  for (const bad of [
    {
      ...access,
      token: "encrypted.original.oauth",
      expires_at: new Date(Date.now() + 900000).toISOString(),
    },
    { ...access, url: "https://attacker.invalid/api/preview/status" },
    { ...access, url: access.url + "?token=leak" },
  ])
    rememberSavedPreviewAccess([image], bad, cache)
  rememberSavedPreviewAccess([{ ...image, state: "submitted" }], access, cache)
  assert.equal(cache.values.size, 0)
})

test("blocked private storage degrades safely without losing fresh authorized metadata", () => {
  const blocked = {
    getItem: () => {
      throw new Error("Blocked")
    },
    setItem: () => {
      throw new Error("Blocked")
    },
    removeItem: () => {
      throw new Error("Blocked")
    },
  }
  assert.deepEqual(restoreSavedPreviewAccess([image], access, blocked), access)
  assert.equal(restoreSavedPreviewAccess([image], null, blocked), null)
  assert.doesNotThrow(() => forgetSavedPreviewAccess([image], blocked))
})

test("gallery cache matches the complete set, supports reordered slides and strips extra fields", () => {
  const cache = storage()
  const second = {
    ...image,
    generation_id: "10000000-0000-4000-8000-000000000001",
  }
  const third = {
    ...image,
    generation_id: "10000000-0000-4000-8000-000000000002",
  }
  const withExtra = { ...access, oauth_token: "must-never-be-stored" }
  rememberSavedPreviewAccess([image, second], withExtra, cache)
  assert.deepEqual(
    restoreSavedPreviewAccess([second, image], null, cache),
    access,
  )
  assert.equal(restoreSavedPreviewAccess([image], null, cache), null)
  assert.equal(
    restoreSavedPreviewAccess([image, second, third], null, cache),
    null,
  )
  assert.ok(!JSON.stringify([...cache.values]).includes("must-never-be-stored"))
})

test("renewing one gallery image never overwrites the gallery credential or lends access to another slide", () => {
  const cache = storage()
  const second = {
    ...image,
    generation_id: "10000000-0000-4000-8000-000000000001",
  }
  const renewed = { ...access, token: "sp1." + "b".repeat(43) }
  rememberSavedPreviewAccess([image, second], access, cache)
  rememberSavedPreviewAccess([image], renewed, cache)
  assert.deepEqual(
    restoreSavedPreviewAccess([image, second], null, cache),
    access,
  )
  assert.deepEqual(restoreSavedPreviewAccess([image], null, cache), renewed)
  assert.equal(restoreSavedPreviewAccess([second], null, cache), null)
})
