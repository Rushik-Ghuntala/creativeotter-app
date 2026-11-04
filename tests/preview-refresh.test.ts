import test from "node:test"
import assert from "node:assert/strict"
import type { App } from "@modelcontextprotocol/ext-apps"
import { generationSnapshotSchema } from "@/lib/media/contracts"
import {
  generationStatusUri,
  refreshGenerationStatus,
  resolvePreviewToolName,
} from "@/lib/mcp/preview-refresh"

const id = "2192a7f9-46d2-49c7-8351-0394e29e982f"
const snapshot = generationSnapshotSchema.parse({
  generation_id: id,
  execution_source: "provider",
  quote_id: id,
  job_id: "3a49f088-dcb6-4593-929b-23411a344e3c",
  model: "image/nano-banana-2",
  model_name: "Nano Banana 2",
  host_name: null,
  state: "succeeded",
  input: {
    prompt: "Existing saved image",
    aspect_ratio: "4:5",
    resolution: "1K",
    reference_asset_ids: [],
  },
  max_cost_micro_usd: "80000",
  credit_units: "16000",
  credit_status: "charged",
  estimated_cost_label: "$0.08",
  pricing_version: "test",
  expires_at: null,
  review_url: null,
  job_url: null,
  references: [],
  outputs: [],
  error: null,
  message: "Saved image",
})
type Bridge = Pick<
  App,
  "callServerTool" | "readServerResource" | "getHostContext"
>
const bridge = (overrides: Partial<Bridge>): Bridge => ({
  getHostContext: () => undefined,
  callServerTool: async () => {
    throw new Error("Unexpected tools/call")
  },
  readServerResource: async () => {
    throw new Error("Unexpected resources/read")
  },
  ...overrides,
})

test("refresh preserves host-qualified names and accepts text-only tool results", async () => {
  assert.equal(
    resolvePreviewToolName("check_job", "mcp__creativeotter__generate_image"),
    "mcp__creativeotter__check_job",
  )
  assert.equal(
    resolvePreviewToolName("check_job", "creativeotter-show_image_gallery"),
    "creativeotter-check_job",
  )
  assert.equal(
    resolvePreviewToolName("check_job", "generate_image"),
    "check_job",
  )
  assert.equal(resolvePreviewToolName("check_job", "unrelated"), "check_job")
  let calls = 0
  const result = await refreshGenerationStatus(
    bridge({
      callServerTool: async (params) => {
        calls++
        assert.equal(params.name, "check_job")
        assert.deepEqual(params.arguments, { quote_id: id })
        return { content: [{ type: "text", text: JSON.stringify(snapshot) }] }
      },
    }),
    snapshot,
  )
  assert.equal(result.state, "succeeded")
  assert.equal(calls, 1)
})

test("Claude tool-channel failure falls back to the authenticated status resource, never generation", async () => {
  const calls: string[] = []
  const result = await refreshGenerationStatus(
    bridge({
      callServerTool: async ({ name }) => {
        calls.push(name)
        throw new Error("MCP error -32603: IPC not available for MCP tool call")
      },
      readServerResource: async ({ uri }) => {
        calls.push(uri)
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(snapshot),
            },
          ],
        }
      },
    }),
    { ...snapshot, state: "submitted", outputs: [], credit_status: "reserved" },
  )
  assert.equal(result.state, "succeeded")
  assert.equal(result.credit_status, "charged")
  assert.deepEqual(calls, ["check_job", generationStatusUri(snapshot)])
})

test("refresh never substitutes another image or accepts HTML as status", async () => {
  for (const response of [
    {
      contents: [
        {
          uri: generationStatusUri(snapshot),
          mimeType: "application/json",
          text: JSON.stringify({
            ...snapshot,
            generation_id: "10000000-0000-4000-8000-000000000001",
          }),
        },
      ],
    },
    {
      contents: [
        {
          uri: generationStatusUri(snapshot),
          mimeType: "text/html",
          text: "<script>not status</script>",
        },
      ],
    },
  ]) {
    await assert.rejects(
      () =>
        refreshGenerationStatus(
          bridge({ readServerResource: async () => response }),
          snapshot,
        ),
      AggregateError,
    )
  }
})

test("status resource never dispatches a queued existing job and denies revoked media access", async () => {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js")
  const { WebStandardStreamableHTTPServerTransport } =
    await import("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js")
  const { registerGenerationStatusResource } =
    await import("@/lib/mcp/generation-status-resource")
  const quote = {
    id,
    workspace_id: id,
    input: snapshot.input,
    max_cost_micro_usd: 80000,
    credit_units: 16000,
    credit_pricing_version: "fixture",
    pricing_version: "fixture",
    expires_at: new Date(Date.now() + 60000).toISOString(),
  }
  for (const allowed of [true, false]) {
    const calls: string[] = []
    const client = {
      rpc: async (name: string) => {
        calls.push(name)
        return {
          data: { enabled: allowed, can_read: allowed, can_prepare: false },
        }
      },
      from: (name: string) => {
        calls.push(name)
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: async () => ({
            data:
              name === "generation_quotes"
                ? quote
                : {
                    id: snapshot.job_id,
                    state: "queued",
                    credit_status: "reserved",
                    output_asset_id: null,
                  },
            error: null,
          }),
        }
        return chain
      },
    }
    const server = new McpServer({ name: "resource-no-dispatch", version: "1" })
    registerGenerationStatusResource(
      server,
      client as unknown as Parameters<
        typeof registerGenerationStatusResource
      >[1],
      {
        user_id: id,
        client_id: "fixture",
        workspace: { id, name: "Fixture" },
        role: "owner",
        permissions: ["media:read"],
      },
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
            method: "resources/read",
            params: { uri: generationStatusUri(snapshot) },
          }),
        }),
      )
      const data = await response.json()
      if (allowed) {
        assert.equal(data.error, undefined)
        assert.equal(JSON.parse(data.result.contents[0].text).state, "queued")
        assert.deepEqual(calls, [
          "get_generation_access",
          "generation_quotes",
          "generation_jobs",
        ])
      } else {
        assert.ok(data.error)
        assert.deepEqual(calls, ["get_generation_access"])
      }
    } finally {
      await server.close()
    }
  }
})
