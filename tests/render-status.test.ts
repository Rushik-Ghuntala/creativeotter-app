import test from "node:test"
import assert from "node:assert/strict"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import {
  registerRenderTools,
  RENDER_RESOURCE_URI,
} from "@/lib/mcp/render-tools"

const id = "10000000-0000-4000-8000-000000000001"
const other = "20000000-0000-4000-8000-000000000002"

test("progress polling never opens another player, signs media links or changes credits", async () => {
  const environment = {
    CREATIVEOTTER_RENDERING_ENABLED: "true",
    NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture",
  }
  const previous = Object.fromEntries(
    Object.keys(environment).map((name) => [name, process.env[name]]),
  )
  Object.assign(process.env, environment)
  const effects = { signedLinks: 0, previewCredentials: 0, writes: 0 }
  let state = "queued"
  const database = {
    from: (table: string) => {
      assert.equal(table, "render_jobs")
      const filters: Record<string, string> = {}
      const query = {
        select: () => query,
        eq: (key: string, value: string) => {
          filters[key] = value
          return query
        },
        single: async () => ({
          data:
            filters.workspace_id === id && filters.id === id
              ? {
                  id,
                  input: {
                    title: "Saved brand video",
                    format: "mp4",
                    width: 1080,
                    height: 1080,
                    duration_seconds: 15,
                  },
                  state,
                  credit_units: "16000",
                  storage_path: "saved/video.mp4",
                }
              : null,
          error: null,
        }),
      }
      return query
    },
    storage: {
      from: () => ({
        createSignedUrl: async () => {
          effects.signedLinks++
          return {
            data: { signedUrl: "https://fixture.supabase.co/saved/video.mp4" },
            error: null,
          }
        },
      }),
    },
    rpc: async (name: string) => {
      if (name === "create_render_preview") {
        effects.previewCredentials++
        return { error: null }
      }
      effects.writes++
      throw new Error("Polling must not mutate or bill")
    },
  } as unknown as SupabaseClient<Database>
  const server = new McpServer({
    name: "render-presentation-test",
    version: "1",
  })
  const client = new Client({ name: "ordinary-video-request", version: "1" })
  try {
    registerRenderTools(
      server,
      database,
      {
        user_id: id,
        client_id: "test",
        workspace: { id, name: "Fixture" },
        role: "owner",
        permissions: ["media:prepare"],
      },
      "https://creativeotter.invalid",
    )
    const [a, b] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(a), client.connect(b)])
    const { tools } = await client.listTools()
    const progress = tools.find((tool) => tool.name === "get_render_status")!
    assert.equal(progress.annotations?.readOnlyHint, true)
    assert.equal(progress._meta?.ui, undefined)
    assert.equal(progress._meta?.["openai/outputTemplate"], undefined)
    for (const name of ["render_design", "get_render"]) {
      const tool = tools.find((entry) => entry.name === name)!
      assert.equal(tool._meta?.["openai/outputTemplate"], RENDER_RESOURCE_URI)
    }
    const opened = await client.callTool({
      name: "get_render",
      arguments: { render_id: id },
    })
    assert.notEqual(opened.isError, true)
    assert.equal(effects.previewCredentials, 1)
    for (const next of [
      "queued",
      "running",
      "saving",
      "succeeded",
      "succeeded",
    ]) {
      state = next
      const result = await client.callTool({
        name: "get_render_status",
        arguments: { render_id: id },
      })
      assert.notEqual(result.isError, true)
      const data = result.structuredContent as Record<string, unknown>
      assert.equal(data.state, next)
      assert.equal(data.saved, next === "succeeded")
      assert.equal(data.credit_units, "16000")
      assert.equal(
        data.credit_status,
        next === "succeeded" ? "charged" : "reserved",
      )
      assert.equal(result._meta, undefined)
      const serialized = JSON.stringify(result)
      assert.doesNotMatch(
        serialized,
        /https?:|download_url|preview_url|render-access|outputTemplate|resourceUri/,
      )
    }
    assert.deepEqual(effects, {
      signedLinks: 0,
      previewCredentials: 1,
      writes: 0,
    })
    const denied = await client.callTool({
      name: "get_render_status",
      arguments: { render_id: other },
    })
    assert.equal(denied.isError, true)
    assert.equal(denied.structuredContent, undefined)
    const reopened = await client.callTool({
      name: "get_render",
      arguments: { render_id: id },
    })
    assert.equal(
      (reopened.structuredContent as Record<string, unknown>).saved,
      true,
    )
    assert.equal(effects.signedLinks, 1)
    assert.equal(effects.previewCredentials, 2)
    assert.equal(effects.writes, 0)
  } finally {
    await client.close()
    await server.close()
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
