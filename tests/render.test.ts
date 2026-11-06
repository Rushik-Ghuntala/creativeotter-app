import test from "node:test"
import assert from "node:assert/strict"
import { renderInputSchema } from "@/lib/render/contracts"
import { validateRenderInput, renderDocument } from "@/lib/render/sanitize"
const input = renderInputSchema.parse({
  title: "Our new menu is here",
  format: "mp4",
  html: "<h1 class=title>Our new menu is here</h1>",
  css: ".title{animation:in 2s}@keyframes in{from{opacity:0}to{opacity:1}}",
  width: 864,
  height: 1080,
})
test("HTML rendering bounds output size, duration, frame rate and source size", () => {
  for (const patch of [
    { width: 1922 },
    { width: 129 },
    { duration_seconds: 31 },
    { fps: 60 },
    { html: "x".repeat(24001) },
    { format: "html" },
    { asset_ids: ["not-an-id"] },
  ])
    assert.equal(
      renderInputSchema.safeParse({ ...input, ...patch }).success,
      false,
    )
  assert.throws(() => validateRenderInput({ ...input, duration_seconds: 11 }))
  assert.equal(validateRenderInput(input).format, "mp4")
})
test("untrusted scripts, network access and CSS escapes are rejected before spending", () => {
  for (const html of [
    "<script>alert(1)</script>",
    "<iframe src=file:///etc/passwd></iframe>",
    "<div onclick=alert(1)>Hello</div>",
    "<img src=https://localhost/private>",
    "<meta http-equiv=refresh>",
    "<form>test</form>",
  ])
    assert.throws(() => validateRenderInput({ ...input, html }))
  for (const css of [
    "@import 'https://evil.example'",
    "body{background:url(http://localhost)}",
    "body{background:u\\72l(x)}",
    "</style><script>bad</script>",
  ])
    assert.throws(() => validateRenderInput({ ...input, css }))
})
test("rendered documents block scripts and networking and require owned asset references", () => {
  const document = renderDocument(input)
  assert.match(document, /script-src 'none'/)
  assert.match(document, /default-src 'none'/)
  assert.match(document, /@keyframes/)
  assert.throws(() =>
    validateRenderInput({
      ...input,
      html: "<img src=asset:10000000-0000-4000-8000-000000000001>",
    }),
  )
  const clean = validateRenderInput({
    ...input,
    html: "<h1 data-secret=hidden>Welcome</h1>",
  })
  assert.ok(!clean.html.includes("data-secret"))
})

test("render request limits stop chunked uploads before buffering the entire body", async () => {
  const { readRenderBody } = await import("@/lib/render/request")
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      controller.enqueue(new Uint8Array(20))
      controller.enqueue(new Uint8Array(20))
    },
    cancel: () => {
      cancelled = true
    },
  })
  const request = new Request("https://example.test/api/render", {
    method: "POST",
    body,
    duplex: "half",
  } as RequestInit)
  await assert.rejects(() => readRenderBody(request, 30))
  assert.equal(cancelled, true)
  assert.equal(
    await readRenderBody(
      new Request("https://example.test", { method: "POST", body: "Hello" }),
      10,
    ),
    "Hello",
  )
})

test("owned image references embed only supplied validated raster data", () => {
  const id = "10000000-0000-4000-8000-000000000001"
  const imageInput = {
    ...input,
    html: `<img src="asset:${id}" alt="My logo">`,
    asset_ids: [id],
  }
  const data = "data:image/png;base64,iVBORw0KGgo="
  assert.match(
    renderDocument(imageInput, { [id]: data }),
    /data:image\/png;base64/,
  )
  assert.throws(() =>
    renderDocument(imageInput, { [id]: "https://evil.example/image.png" }),
  )
  assert.throws(() =>
    validateRenderInput({
      ...input,
      html: '<div style="background:url(http://localhost)">Hello</div>',
    }),
  )
})
