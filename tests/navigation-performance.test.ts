import test from "node:test"
import assert from "node:assert/strict"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import type { MediaAsset } from "@/lib/media/contracts"
import { signAssets } from "@/lib/media/assets"
import { listLibraryAssets } from "@/lib/studio/service"

const assets = Array.from({ length: 24 }, (_, index): MediaAsset => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  workspace_id: "20000000-0000-4000-8000-000000000001",
  user_id: "30000000-0000-4000-8000-000000000001",
  kind: "output",
  status: "ready",
  storage_path: `workspace/image-${index}.png`,
  label: `Image ${index}`,
  mime_type: "image/png",
  size_bytes: 100,
  sha256: null,
  width: 100,
  height: 100,
  favorite: false,
  created_at: "2026-11-04T00:00:00Z",
}))
const fixture = (denied = false) => {
  const requests: {
    path: string
    url: URL
    body: Record<string, unknown> | null
    range: string | null
  }[] = []
  const client = createClient<Database>(
    "https://fixture.supabase.co",
    "fixture-anon-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (input, init) => {
          const url = new URL(String(input)),
            path = url.pathname
          const body = init?.body ? JSON.parse(String(init.body)) : null
          requests.push({
            path,
            url,
            body,
            range: new Headers(init?.headers).get("range"),
          })
          if (path.includes("/storage/v1/object/sign/")) {
            const paths = body.paths as string[]
            return Response.json(
              paths
                .slice()
                .reverse()
                .map((path, index) => ({
                  path,
                  error: denied && index === 0 ? "Not permitted" : null,
                  signedURL:
                    denied && index === 0
                      ? null
                      : `/object/sign/creativeotter-media/${path}?token=fixture`,
                })),
            )
          }
          if (path.endsWith("/media_assets")) {
            const offset = Number(url.searchParams.get("offset") || 0)
            const limit = Number(url.searchParams.get("limit") || 24)
            return Response.json(assets.slice(offset, offset + limit), {
              headers: {
                "content-range": `${offset}-${offset + limit - 1}/24`,
              },
            })
          }
          if (
            path.endsWith("/native_generations") ||
            path.endsWith("/generation_jobs")
          )
            return Response.json([])
          throw new Error(`Unexpected fixture request ${path}`)
        },
      },
    },
  )
  return { client, requests }
}

test("24 private previews use one signing request while preserving order and download names", async () => {
  const { client, requests } = fixture()
  const signed = await signAssets(client, assets)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].body?.expiresIn, 3600)
  assert.deepEqual(
    requests[0].body?.paths,
    assets.map((asset) => asset.storage_path),
  )
  assert.deepEqual(
    signed.map((asset) => asset.id),
    assets.map((asset) => asset.id),
  )
  for (const [index, asset] of signed.entries()) {
    const view = new URL(asset.url),
      download = new URL(asset.download_url)
    assert.ok(view.pathname.endsWith(assets[index].storage_path))
    assert.equal(view.searchParams.get("download"), null)
    assert.equal(
      download.searchParams.get("token"),
      view.searchParams.get("token"),
    )
    assert.equal(
      download.searchParams.get("download"),
      `creativeotter-${asset.id}.png`,
    )
  }
})

test("batch signing rejects unavailable private assets and skips an empty set", async () => {
  const { client, requests } = fixture(true)
  assert.deepEqual(await signAssets(client, []), [])
  assert.equal(requests.length, 0)
  await assert.rejects(
    signAssets(client, assets),
    /Unable to open this private asset/,
  )
})

test("overview requests only four recent assets while the library keeps its full page and exact count", async () => {
  for (const size of [4, 24]) {
    const { client, requests } = fixture()
    const library = await listLibraryAssets(client, assets[0].workspace_id, {
      size,
    })
    assert.equal(library.items.length, size)
    assert.equal(library.total, 24)
    assert.equal(library.size, size)
    assert.equal(
      requests.filter((request) => request.path.includes("/storage/")).length,
      1,
    )
    assert.deepEqual(
      library.items.map((item) => item.asset.id),
      assets.slice(0, size).map((asset) => asset.id),
    )
    const query = requests.find((request) =>
      request.path.endsWith("/media_assets"),
    )!
    assert.equal(
      query.url.searchParams.get("workspace_id"),
      `eq.${assets[0].workspace_id}`,
    )
    assert.equal(query.url.searchParams.get("status"), "eq.ready")
  }
})
