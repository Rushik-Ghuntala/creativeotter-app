import test from "node:test"
import assert from "node:assert/strict"
import {
  publicWebsiteUrl,
  publicAddress,
  createPublicWebsiteReader,
} from "@/lib/brand/public-fetch"
import { extractWebsiteArtwork } from "@/lib/brand/extract"
import { normalizeBrandImage, sanitizeBrandSvg } from "@/lib/brand/image"
import {
  collectWebsiteArtwork,
  discoverBrandAssets,
} from "@/lib/brand/discovery"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" aria-label="Acme logo"><path fill="#0a8" d="M0 0h200v60H0z"/></svg>'
test("website URLs reject local networks, credential URLs and alternate protocols", () => {
  assert.equal(publicWebsiteUrl("acme.com").href, "https://acme.com/")
  for (const url of [
    "http://acme.com",
    "https://127.0.0.1",
    "https://2130706433",
    "https://[::1]",
    "https://u:p@acme.com",
    "https://acme.com:444",
    "file:///etc/passwd",
    "https://app.local",
    "https://localhost",
  ])
    assert.throws(() => publicWebsiteUrl(url))
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.2.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:8.8.8.8",
  ])
    assert.equal(publicAddress(address), false, address)
  assert.equal(publicAddress("8.8.8.8"), true)
  assert.equal(publicAddress("2606:4700:4700::1111"), true)
})
test("mixed public/private DNS answers are rejected before a socket opens", async () => {
  const read = createPublicWebsiteReader(async () => [
    { address: "8.8.8.8", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ])
  await assert.rejects(read("https://acme.com", 100), /not public/)
})
test("artwork extraction keeps the company identity and originals without customer marks or tracking pixels", () => {
  const html = `<header><a href="/">${svg}</a></header><div class="customers"><svg aria-label="Other logo"><path d="M0 0"/></svg><img src="/customer-logo.png" alt="Other logo"/></div><svg aria-label="Other"><path d="M0 0"/></svg><img src="/agents/hero.webp" alt="Our mascot"/><img src="/dashboard.png" alt="Product screenshot"/><img src="/pixel.png"/><link rel="apple-touch-icon" href="https://cdn.acme.com/icon.png"/><a href="/brand">Brand</a><a href="https://badacme.com/brand">Brand</a><a href="/customers/other">Product story</a>`
  const result = extractWebsiteArtwork(html, "https://acme.com/")
  assert(result.candidates.some((x) => x.svg && x.role === "logo"))
  assert(
    result.candidates.some(
      (x) => x.role === "character" && x.url?.endsWith("hero.webp"),
    ),
  )
  assert(
    result.candidates.some(
      (x) => x.role === "product" && x.url?.endsWith("dashboard.png"),
    ),
  )
  assert(
    !result.candidates.some((x) =>
      /Other|customer-logo|pixel/.test(x.label + String(x.url)),
    ),
  )
  assert.deepEqual(result.links, ["https://acme.com/brand"])
})
test("SVG normalization keeps a real visible mark and blocks active or external content", async () => {
  for (const bad of [
    svg.replace("<path", "<script>alert(1)</script><path"),
    '<svg><image href="file:///etc/passwd"/></svg>',
    '<svg><use href="https://evil.com/a.svg#x"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + svg,
    '<svg><path fill="url(https://evil.com/x)"/></svg>',
  ])
    assert.throws(() => sanitizeBrandSvg(bad))
  const result = await normalizeBrandImage(Buffer.from(svg), true)
  assert(result.width >= 200 && result.height >= 60)
  assert.equal(result.bytes.subarray(1, 4).toString(), "PNG")
})
test("supporting pages stay in the company domain and unavailable pages do not discard homepage artwork", async () => {
  const read = async (url: string) => ({
    url: url.endsWith("/brand") ? "https://notacme.com/brand" : url,
    mime: "text/html",
    bytes: Buffer.from(
      url.endsWith("/brand")
        ? '<img src="/foreign-logo.png"/>'
        : `<a href="/brand">Brand</a>${svg}`,
    ),
  })
  const result = await collectWebsiteArtwork("https://acme.com", read)
  assert.equal(result.pages.length, 1)
  assert(!result.candidates.some((x) => x.url?.includes("foreign")))
})
test("discovery checks workspace media permission before website access or storage", async () => {
  const client = {
    rpc: async () => ({
      data: { enabled: true, can_prepare: false },
      error: null,
    }),
  } as unknown as SupabaseClient<Database>
  await assert.rejects(
    discoverBrandAssets(client, "fixture", "https://acme.com", 6),
    /media access/,
  )
})
