import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { bundleMotionAssets } from "@/lib/render/project-assets"
import {
  packProject,
  projectDigest,
  readProjectZip,
} from "@/lib/render/project"

const workspace = "10000000-0000-4000-8000-000000000001"
const assetId = "10000000-0000-4000-8000-000000000002"
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6NV0AAAAASUVORK5CYII=",
  "base64",
)
const zip = packProject([
  { path: "index.html", content: '<img src="assets/logo.png">' },
])
const fixture = (patch: Record<string, unknown> = {}, download = png) => {
  const row = {
    id: assetId,
    workspace_id: workspace,
    status: "ready",
    storage_path: `${workspace}/logo.png`,
    mime_type: "image/png",
    size_bytes: png.length,
    sha256: createHash("sha256").update(png).digest("hex"),
    ...patch,
  }
  const filters = new Map<string, unknown>()
  let reads = 0
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => {
      filters.set(key, value)
      return query
    },
    single: async () => ({
      data: [...filters].every(
        ([key, value]) => row[key as keyof typeof row] === value,
      )
        ? row
        : null,
      error: null,
    }),
  }
  const client = {
    from: () => query,
    storage: {
      from: () => ({
        download: async (path: string) => {
          assert.equal(path, row.storage_path)
          reads++
          return { data: new Blob([download]), error: null }
        },
      }),
    },
  } as unknown as SupabaseClient<Database>
  return { client, reads: () => reads }
}

test("motion projects bundle exact private artwork and retries retain the same digest", async () => {
  const f = fixture()
  const attachments = [{ asset_id: assetId, path: "assets/logo.png" }]
  const bundled = await bundleMotionAssets(
    f.client,
    workspace,
    zip,
    attachments,
  )
  assert.deepEqual(Buffer.from(readProjectZip(bundled)["assets/logo.png"]), png)
  assert.deepEqual(
    readProjectZip(bundled)["index.html"],
    readProjectZip(zip)["index.html"],
  )
  assert.equal(
    projectDigest(bundled),
    projectDigest(
      await bundleMotionAssets(f.client, workspace, zip, attachments),
    ),
  )
})

test("artwork destinations cannot overwrite source, existing assets or another attachment", async () => {
  for (const paths of [
    ["../logo.png"],
    ["index.html"],
    ["assets/logo.svg"],
    ["assets/logo.png", "assets/LOGO.png"],
  ]) {
    const f = fixture()
    await assert.rejects(() =>
      bundleMotionAssets(
        f.client,
        workspace,
        zip,
        paths.map((path) => ({ asset_id: assetId, path })),
      ),
    )
    assert.equal(f.reads(), 0)
  }
  const f = fixture()
  const bundled = await bundleMotionAssets(f.client, workspace, zip, [
    { asset_id: assetId, path: "assets/logo.png" },
  ])
  await assert.rejects(() =>
    bundleMotionAssets(f.client, workspace, bundled, [
      { asset_id: assetId, path: "assets/LOGO.png" },
    ]),
  )
  assert.equal(f.reads(), 1)
})

test("foreign, pending, corrupt and mislabeled artwork never reaches a saved project", async () => {
  for (const patch of [
    { workspace_id: "foreign" },
    { status: "pending" },
    { sha256: "0".repeat(64) },
    { size_bytes: png.length + 1 },
    { mime_type: "image/webp" },
  ]) {
    const f = fixture(patch)
    await assert.rejects(() =>
      bundleMotionAssets(f.client, workspace, zip, [
        { asset_id: assetId, path: "assets/logo.png" },
      ]),
    )
    if (patch.workspace_id || patch.status || patch.mime_type)
      assert.equal(f.reads(), 0)
  }
  const bad = fixture({}, Buffer.alloc(png.length))
  await assert.rejects(() =>
    bundleMotionAssets(bad.client, workspace, zip, [
      { asset_id: assetId, path: "assets/logo.png" },
    ]),
  )
})

test("projects without added artwork preserve the existing archive without storage access", async () => {
  const f = fixture()
  assert.equal(await bundleMotionAssets(f.client, workspace, zip, []), zip)
  assert.equal(f.reads(), 0)
})
