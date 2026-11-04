import test from "node:test"
import assert from "node:assert/strict"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import {
  buildGalleryUrl,
  parseGalleryQuery,
} from "@/lib/media/gallery-contracts"

const id = "10000000-0000-4000-8000-000000000001"
test("explicit gallery URLs preserve order and reject duplicate, invalid and over-limit selection", () => {
  const request = {
    title: "Launch & team",
    generations: [
      { generation_id: id, execution_source: "native" as const },
      {
        generation_id: "20000000-0000-4000-8000-000000000002",
        execution_source: "provider" as const,
      },
    ],
  }
  const url = new URL(
    buildGalleryUrl("https://creativeotter-app.vercel.app", request),
  )
  assert.equal(url.pathname, "/studio/gallery")
  assert.deepEqual(
    parseGalleryQuery(Object.fromEntries(url.searchParams)),
    request,
  )
  for (const items of [
    "native:bad",
    `native:${id},native:${id}`,
    `other:${id}`,
    `native:${id}:extra`,
    "",
  ])
    assert.throws(() => parseGalleryQuery({ items }))
  assert.throws(() => parseGalleryQuery({ items: [`native:${id}`] }))
  assert.throws(() =>
    buildGalleryUrl(url.origin, {
      ...request,
      generations: Array.from({ length: 21 }, () => request.generations[0]),
    }),
  )
})

test("older chat widget URIs still resolve to the registered CreativeOtter viewer", async () => {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js")
  const { registerGenerationResource } =
    await import("@/lib/mcp/generation-resource")
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-public-key"
  try {
    for (const uri of [
      "ui://creativeotter/generation.html",
      ...[1, 2, 3, 4, 5, 6, 7].map(
        (version) => `ui://creativeotter/generation-v${version}.html`,
      ),
    ]) {
      const server = new McpServer({ name: "resource-test", version: "1.0.0" })
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      })
      try {
        registerGenerationResource(
          server,
          "https://creativeotter-app.vercel.app",
        )
        await server.connect(transport)
        const request = new Request(
          "https://creativeotter-app.vercel.app/api/mcp",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "resources/read",
              params: { uri },
            }),
          },
        )
        const response = await transport.handleRequest(request)
        const data = await response.json()
        assert.equal(data.error, undefined)
        assert.equal(data.result.contents[0].uri, uri)
        assert.equal(
          data.result.contents[0].mimeType,
          "text/html;profile=mcp-app",
        )
      } finally {
        await server.close()
      }
    }
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl
    if (previousKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey
  }
})
