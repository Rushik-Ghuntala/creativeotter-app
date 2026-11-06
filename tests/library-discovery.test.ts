import test from "node:test"
import assert from "node:assert/strict"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { getLibraryAssets } from "@/lib/media/library"

const workspace = "10000000-0000-4000-8000-000000000001"
const nativeId = "20000000-0000-4000-8000-000000000002"
const providerAsset = "30000000-0000-4000-8000-000000000003"
const quoteId = "40000000-0000-4000-8000-000000000004"
const referenceId = "50000000-0000-4000-8000-000000000005"
const rows = [providerAsset, nativeId, referenceId].map((id, index) => ({
  id,
  workspace_id: workspace,
  kind: index === 2 ? "reference" : "output",
  status: "ready",
  storage_path: `${workspace}/${id}.png`,
  label: `Saved image ${index + 1}`,
  mime_type: "image/png",
  width: 100,
  height: 100,
  favorite: false,
  created_at: `2026-11-0${3 - index}T00:00:00Z`,
}))

const fixture = (failedLookup = false) => {
  const requests: URL[] = []
  const client = createClient<Database>(
    "https://fixture.supabase.co",
    "public-key",
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          const url = new URL(String(input))
          requests.push(url)
          if (url.pathname.endsWith("/media_assets")) return Response.json(rows)
          if (url.pathname.endsWith("/native_generations"))
            return Response.json([{ id: nativeId, asset_id: nativeId }])
          if (url.pathname.endsWith("/generation_jobs"))
            return failedLookup
              ? Response.json({ message: "Denied" }, { status: 403 })
              : Response.json([
                  { quote_id: quoteId, output_asset_id: providerAsset },
                ])
          if (url.pathname.includes("/storage/v1/object/sign/"))
            return Response.json(
              rows.map((asset) => ({
                path: asset.storage_path,
                signedURL: `/object/sign/bucket/${asset.id}?token=fixture`,
              })),
            )
          throw new Error(`Unexpected request ${url.pathname}`)
        },
      },
    },
  )
  return { client, requests }
}

test("saved image discovery supplies exact gallery references without local history and keeps newest-first order", async () => {
  const { client, requests } = fixture()
  const assets = await getLibraryAssets(client, workspace, {
    kind: "output",
    limit: 3,
  })
  assert.deepEqual(
    assets.map((asset) => asset.id),
    rows.map((asset) => asset.id),
  )
  assert.deepEqual(
    assets.map((asset) => asset.gallery_reference),
    [
      { generation_id: quoteId, execution_source: "provider" },
      { generation_id: nativeId, execution_source: "native" },
      null,
    ],
  )
  assert.equal(assets[0].created_at, rows[0].created_at)
  assert.equal(assets[2].kind, "reference")
  for (const url of requests.filter((url) =>
    url.pathname.includes("/rest/v1/"),
  )) {
    assert.equal(url.searchParams.get("workspace_id"), `eq.${workspace}`)
  }
  const list = requests.find((url) => url.pathname.endsWith("/media_assets"))!
  assert.equal(list.searchParams.get("kind"), "eq.output")
  assert.equal(list.searchParams.get("status"), "eq.ready")
  assert.equal(list.searchParams.get("limit"), "3")
  assert.equal(list.searchParams.get("order"), "created_at.desc,id.desc")
  for (const url of requests.filter((url) =>
    /native_generations|generation_jobs/.test(url.pathname),
  )) {
    assert.equal(url.searchParams.get("state"), "eq.succeeded")
    const ids = url.searchParams.get(
      url.pathname.endsWith("/native_generations")
        ? "asset_id"
        : "output_asset_id",
    )!
    assert.ok(ids.includes(nativeId) && ids.includes(providerAsset))
    assert.equal(ids.includes(referenceId), false)
  }
  assert.equal(
    requests.filter((url) => url.pathname.includes("/storage/")).length,
    1,
  )
})

test("discovery fails clearly if generation access fails instead of guessing provider IDs", async () => {
  const { client } = fixture(true)
  await assert.rejects(
    () => getLibraryAssets(client, workspace, { limit: 3 }),
    /resolve your saved image previews/,
  )
  await assert.rejects(
    () => getLibraryAssets(client, workspace, { limit: 3, requireAsset: true }),
    /asset_id is required/,
  )
})
