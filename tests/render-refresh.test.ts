import test from "node:test"
import assert from "node:assert/strict"
import { refreshRenderFromHost } from "@/lib/render/refresh"

const id = "10000000-0000-4000-8000-000000000001"
const snapshot = {
  render_id: id,
  title: "SpaceOffice launch",
  format: "mp4",
  state: "succeeded",
  width: 1920,
  height: 1080,
  duration_seconds: 30,
  fps: 30,
  credit_units: "16000",
  credit_status: "charged",
  preview_url: "https://fixture.supabase.co/saved.mp4",
  download_url: "https://fixture.supabase.co/saved.mp4?download=launch.mp4",
  saved: true,
  urls_expire_at: "2026-11-06T23:00:00Z",
  message: "Your video is ready.",
}

test("motion refresh retains Codex and Claude connector names and restores text-only delivery", async () => {
  for (const entry of [
    "get_render",
    "mcp__creativeotter-dev__render_design",
    "creativeotter-dev:get_render",
  ]) {
    const received: unknown[] = []
    const result = await refreshRenderFromHost(
      {
        getHostContext: () =>
          ({ toolInfo: { tool: { name: entry } } }) as never,
        callServerTool: async (args) => {
          received.push(args)
          return { content: [{ type: "text", text: JSON.stringify(snapshot) }] }
        },
      },
      id,
    )
    assert.equal(result.saved, true)
    assert.deepEqual(received, [
      {
        name: entry.replace(/render_design$/, "get_render"),
        arguments: { render_id: id },
      },
    ])
  }
})

test("motion refresh rejects a different saved design or failed host response", async () => {
  for (const result of [
    { isError: true, content: [] },
    {
      content: [],
      structuredContent: {
        ...snapshot,
        render_id: "20000000-0000-4000-8000-000000000002",
      },
    },
  ]) {
    await assert.rejects(() =>
      refreshRenderFromHost(
        { getHostContext: () => undefined, callServerTool: async () => result },
        id,
      ),
    )
  }
})
