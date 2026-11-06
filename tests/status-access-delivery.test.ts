import test, { after } from "node:test"
import assert from "node:assert/strict"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { registerNativeTools } from "@/lib/mcp/native-tools"
import { registerMediaTools } from "@/lib/mcp/media-tools"
import { registerGenerationStatusResource } from "@/lib/mcp/generation-status-resource"

const env = {
  NEXT_PUBLIC_APP_URL: "https://creativeotter-app.vercel.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-key",
}
const previous = Object.fromEntries(
  Object.keys(env).map((key) => [key, process.env[key]]),
)
Object.assign(process.env, env)
after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
const id = "10000000-0000-4000-8000-000000000001"
const assetId = "20000000-0000-4000-8000-000000000002"
const context = {
  user_id: id,
  client_id: "fixture",
  workspace: { id, name: "Fixture" },
  role: "owner" as const,
  permissions: ["account:read", "media:read"],
}
const asset = {
  id: assetId,
  storage_path: "fixture/image.png",
  label: "Saved image",
  mime_type: "image/png",
  width: 100,
  height: 100,
  favorite: false,
}
const native = {
  id,
  state: "succeeded",
  asset_id: assetId,
  input: { prompt: "Saved image" },
  host_name: "codex",
  reported_model: null,
  credit_units: 16000,
  credit_status: "charged",
  credit_pricing_version: "fixture",
  expires_at: null,
  public_error: null,
}
const quote = {
  id,
  input: { prompt: "Saved image" },
  max_cost_micro_usd: 80000,
  credit_units: 16000,
  credit_pricing_version: "fixture",
  pricing_version: "fixture",
  expires_at: new Date(Date.now() + 60000).toISOString(),
}
const job = {
  id,
  state: "succeeded",
  output_asset_id: assetId,
  credit_status: "charged",
  public_error: null,
}

for (const channel of ["native", "provider", "resource"] as const) {
  test(`${channel} status recovery returns renewed image-scoped access only in private metadata`, async () => {
    const source = channel === "provider" ? "provider" : "native"
    const calls: string[] = []
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(name)
        if (name === "get_generation_access")
          return { data: { enabled: true, can_read: true } }
        assert.equal(name, "create_saved_preview")
        assert.deepEqual(args.generations, [
          { generation_id: id, execution_source: source },
        ])
        return { data: id, error: null }
      },
      from: (table: string) => {
        calls.push(table)
        const data =
          table === "native_generations"
            ? native
            : table === "generation_quotes"
              ? quote
              : job
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          single: async () => ({ data, error: null }),
          then: (resolve: (value: { data: unknown[] }) => unknown) =>
            Promise.resolve({ data: [asset] }).then(resolve),
        }
        return chain
      },
      storage: {
        from: () => ({
          createSignedUrls: async () => ({
            data: [
              {
                path: asset.storage_path,
                signedUrl:
                  "https://fixture.supabase.co/private/image.png?token=fixture",
              },
            ],
            error: null,
          }),
        }),
      },
    }
    const server = new McpServer({ name: "status-renewal", version: "fixture" })
    const typedClient = client as unknown as Parameters<
      typeof registerNativeTools
    >[1]
    if (channel === "native")
      registerNativeTools(
        server,
        typedClient,
        context,
        "fixture-oauth-never-exposed",
      )
    else if (channel === "provider")
      registerMediaTools(
        server,
        typedClient,
        context,
        env.NEXT_PUBLIC_APP_URL,
        "fixture-oauth-never-exposed",
      )
    else
      registerGenerationStatusResource(
        server,
        typedClient,
        context,
        "fixture-oauth-never-exposed",
      )
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    try {
      const response = await transport.handleRequest(
        new Request("https://fixture.invalid/mcp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: channel === "resource" ? "resources/read" : "tools/call",
            params:
              channel === "resource"
                ? { uri: `creativeotter://generation/native/${id}` }
                : {
                    name:
                      channel === "native"
                        ? "get_native_generation"
                        : "check_job",
                    arguments:
                      channel === "native"
                        ? { generation_id: id }
                        : { quote_id: id },
                  },
          }),
        }),
      )
      const data = await response.json()
      assert.equal(data.error, undefined)
      assert.equal(data.result.isError, undefined)
      const access = data.result._meta["creativeotter/preview-access"]
      assert.match(access.token, /^sp1\.[A-Za-z0-9_-]{43}$/)
      assert.equal(access.expires_at, null)
      assert.ok(
        !JSON.stringify(data.result.content || data.result.contents).includes(
          access.token,
        ),
      )
      assert.ok(!JSON.stringify(data).includes("fixture-oauth-never-exposed"))
      assert.equal(
        calls.filter((name) => name === "create_saved_preview").length,
        1,
      )
      assert.ok(
        calls.every((name) =>
          [
            "get_generation_access",
            "native_generations",
            "generation_quotes",
            "generation_jobs",
            "media_assets",
            "create_saved_preview",
          ].includes(name),
        ),
      )
    } finally {
      await server.close()
    }
  })
}
