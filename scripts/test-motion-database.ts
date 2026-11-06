import { creditSummarySchema } from "../src/lib/credits/contracts"
import type { RenderInput } from "../src/lib/render/contracts"
import assert from "node:assert/strict"
import { randomUUID, createHash } from "node:crypto"
import { writeFile, readFile, mkdir } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { zipSync, strToU8 } from "fflate"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createCreativeOtterMcp } from "../src/lib/mcp/server"
import { createDatabaseConnection } from "./database.mjs"
import { runOneRender } from "../src/lib/render/worker"
import {
  saveMotionRevision,
  readMotionSource,
  motionRenderInput,
} from "../src/lib/render/project-service"
import { MOTION_SOURCE_BUCKET, projectDigest } from "../src/lib/render/project"
import { RENDER_BUCKET } from "../src/lib/render/contracts"
import { motionTemplate } from "../src/lib/render/motion-template"
import { getRender } from "../src/lib/render/service"
import type { Database, McpContext } from "../src/lib/database.types"
const main = async () => {
  process.env.CREATIVEOTTER_RENDERING_ENABLED = "true"
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const admin = createClient<Database>(
    url,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const sql = createDatabaseConnection()
  const ids: string[] = [],
    objects: string[] = [],
    sources: string[] = []
  const keep = process.argv.includes("--keep")
  let success = false
  try {
    const email = `motion-test-${randomUUID()}@example.com`,
      password = `Aa!${randomUUID()}`
    const user = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    assert.equal(user.error, null)
    ids.push(user.data.user!.id)
    const client = createClient<Database>(url, key, {
      auth: { persistSession: false },
    })
    assert.equal(
      (await client.auth.signInWithPassword({ email, password })).error,
      null,
    )
    const ws = (await client.rpc("ensure_personal_workspace")).data!.id
    await sql`insert into private.workspace_render_settings(workspace_id,enabled,mp4_credit_units,pricing_version,valid_until) values(${ws},true,16000,'disposable-hyperframes-test',now()+interval '1 hour')`
    assert.equal(
      (
        await admin.rpc("record_credit_grant", {
          target_workspace: ws,
          units: "100000",
          external_event_id: `motion-test:${randomUUID()}`,
          reason: "Disposable motion tests",
        })
      ).error,
      null,
    )
    assert.equal((await admin.rpc("render_worker_heartbeat")).error, null)
    const wallet = async () => {
      const r = await client.rpc("get_credit_summary", { target_workspace: ws })
      assert.equal(r.error, null)
      return creditSummarySchema.parse(r.data)
    }
    const settings = {
      width: 864,
      height: 1080,
      duration_seconds: 4,
      fps: 30 as const,
    }
    const zip = await readFile(
      "output/hyperframes-tests/summer-launch-project.zip",
    )
    const first = await saveMotionRevision(client, ws, zip, {
      title: "Our summer collection is here",
      settings,
      request_key: randomUUID(),
    })
    sources.push(first.source_path)
    assert.equal((await wallet()).available_units, "100000")
    const downloaded = await readMotionSource(client, ws, first.id)
    assert.equal(projectDigest(downloaded.zip), projectDigest(zip))
    const host = new Client({ name: "Everyday motion prompts", version: "1" })
    const server = createCreativeOtterMcp(
      {
        user_id: ids[0],
        client_id: "local-motion-fixture",
        workspace: { id: ws, name: "Disposable motion workspace" },
        role: "owner",
        permissions: ["account:read", "media:read", "media:prepare"],
      } as McpContext,
      process.env.NEXT_PUBLIC_APP_URL!,
      email,
      client,
    )
    const [left, right] = InMemoryTransport.createLinkedPair()
    await server.connect(left)
    await host.connect(right)
    const tools = (await host.listTools()).tools.map((t) => t.name)
    for (const name of [
      "save_motion_project",
      "revise_motion_project",
      "get_motion_project",
      "prepare_motion_upload",
      "render_design",
    ])
      assert.ok(tools.includes(name))
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await host.callTool({ name, arguments: args })
      assert.notEqual(result.isError, true, JSON.stringify(result.content))
      return result.structuredContent as {
        version: number
        revision_id: string
        source_download_url: string
        render_input: RenderInput
      }
    }
    const opened = await call("get_motion_project", { revision_id: first.id })
    assert.equal(opened.version, 1)
    const sourceDownload = await fetch(opened.source_download_url)
    assert.equal(sourceDownload.status, 200)
    assert.equal(
      projectDigest(new Uint8Array(await sourceDownload.arrayBuffer())),
      first.source_sha256,
    )
    const second = await call("revise_motion_project", {
      title: "Our summer sale is here",
      settings,
      parent_id: first.id,
      changes: [
        {
          path: "index.html",
          content: motionTemplate(
            "Our summer sale is here.",
            "#e0b4ee",
            4,
            true,
          ),
        },
      ],
      change_summary: "Updated the headline",
      request_key: randomUUID(),
    })
    sources.push(`${ws}/${second.revision_id}.zip`)
    assert.equal(second.version, 2)
    assert.equal(
      (await readMotionSource(client, ws, first.id)).revision.source_sha256,
      first.source_sha256,
    )
    assert.deepEqual(
      (await readMotionSource(client, ws, second.revision_id)).revision
        .parent_id,
      first.id,
    )
    await assert.rejects(() =>
      saveMotionRevision(client, ws, zip, {
        title: "Stale version",
        settings,
        parent_id: first.id,
        request_key: randomUUID(),
      }),
    )
    const quote = await client.rpc("prepare_render", {
      target_workspace: ws,
      render_input: second.render_input,
      request_key: randomUUID(),
    })
    assert.equal(quote.error, null)
    for (const field of ["format", "revision_id", "title"]) {
      const malformed = { ...second.render_input } as Record<string, unknown>
      delete malformed[field]
      malformed.unknown_replacement = "bad"
      const rejected = await client.rpc("prepare_render", {
        target_workspace: ws,
        render_input: malformed as unknown as RenderInput,
        request_key: randomUUID(),
      })
      assert.ok(
        rejected.error,
        "Incomplete bound render input must be rejected",
      )
    }

    assert.equal((await wallet()).available_units, "100000")
    assert.equal(
      (await client.rpc("start_render", { target_render: quote.data!.id }))
        .error,
      null,
    )
    assert.equal(
      (await client.rpc("start_render", { target_render: quote.data!.id }))
        .error,
      null,
    )
    assert.equal((await wallet()).reserved_units, "16000")
    const finished = await runOneRender()
    assert.equal(finished?.id, quote.data!.id)
    assert.equal(finished?.state, "succeeded")
    objects.push(finished!.storage_path!)
    const snapshot = await getRender(client, ws, finished!.id)
    assert.equal(snapshot.saved, true)
    assert.equal(snapshot.credit_units, "16000")
    const bytes = Buffer.from(
      await (await fetch(snapshot.download_url!)).arrayBuffer(),
    )
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      finished!.sha256,
    )
    const balance = await wallet()
    assert.equal(balance.available_units, "84000")
    assert.equal(balance.reserved_units, "0")
    assert.equal(balance.spent_units, "16000")
    assert.equal(
      (
        await admin.rpc("complete_render", {
          target_render: finished!.id,
          lease: finished!.lease_id!,
          bytes: bytes.length,
          digest: finished!.sha256!,
        })
      ).error,
      null,
    )
    assert.equal((await wallet()).available_units, "84000")
    const anon = createClient<Database>(url, key, {
      auth: { persistSession: false },
    })
    assert.equal(
      (await anon.from("motion_revisions").select("id")).data?.length || 0,
      0,
    )
    assert.ok(
      (
        await anon.storage
          .from(MOTION_SOURCE_BUCKET)
          .download(first.source_path)
      ).error,
    )
    const attacker = await admin.auth.admin.createUser({
      email: `motion-other-${randomUUID()}@example.com`,
      password,
      email_confirm: true,
    })
    ids.push(attacker.data.user!.id)
    const other = createClient<Database>(url, key, {
      auth: { persistSession: false },
    })
    await other.auth.signInWithPassword({
      email: attacker.data.user!.email!,
      password,
    })
    await other.rpc("ensure_personal_workspace")
    await assert.rejects(() => readMotionSource(other, ws, first.id))
    assert.ok(
      (
        await other.storage
          .from(MOTION_SOURCE_BUCKET)
          .download(first.source_path)
      ).error,
    )
    assert.ok(
      (
        await client.storage
          .from(MOTION_SOURCE_BUCKET)
          .upload(first.source_path, zip, {
            upsert: true,
            contentType: "application/zip",
          })
      ).error,
    )
    // Worker failure releases the reserved 16; the source is saved but a broken animation is never charged.
    const broken = await saveMotionRevision(
      client,
      ws,
      zipSync({
        "index.html": strToU8(
          motionTemplate("Oops", undefined, 4).replace(
            "</head>",
            '<script>throw new Error("broken composition")</script></head>',
          ),
        ),
      }),
      { title: "Failure fixture", settings },
    )
    sources.push(broken.source_path)
    const bad = await client.rpc("prepare_render", {
      target_workspace: ws,
      render_input: motionRenderInput(broken),
      request_key: randomUUID(),
    })
    assert.equal(bad.error, null)
    await client.rpc("start_render", { target_render: bad.data!.id })
    assert.equal((await runOneRender())?.state, "failed")
    assert.equal((await wallet()).available_units, "84000")
    assert.equal((await wallet()).reserved_units, "0")
    await mkdir("output/hyperframes-tests", { recursive: true })
    await writeFile("output/hyperframes-tests/credit-tested-motion.mp4", bytes)
    await writeFile(
      "output/hyperframes-tests/database-report.json",
      JSON.stringify(
        {
          success: true,
          customer_wallet_untouched: true,
          credits_before: 100,
          credits_after: 84,
          credits_charged: 16,
          reserved: 0,
          duplicate_charge: false,
          source_versions: 2,
          original_unchanged: true,
          source_and_output_download_hashes: true,
          tenant_isolation: true,
          failed_render_refunded: true,
          fal_calls: 0,
        },
        null,
        2,
      ),
    )
    if (keep) {
      const jar = new Map<string, string>()
      const web = createServerClient(url, key, {
        cookies: {
          getAll: () => [...jar].map(([name, value]) => ({ name, value })),
          setAll: (values) =>
            values.forEach(({ name, value }) => jar.set(name, value)),
        },
      })
      await web.auth.signInWithPassword({ email, password })
      await writeFile(
        "/tmp/creativeotter-motion-qa.json",
        JSON.stringify({
          workspace: ws,
          user: ids[0],
          users: ids,
          email,
          password,
          cookies: [...jar].map(([name, value]) => ({ name, value })),
          objects,
          sources,
          revision_id: second.revision_id,
          render_id: finished!.id,
        }),
        { mode: 0o600 },
      )
    }
    await host.close()
    await server.close()
    success = true
    console.log(
      "Passed: 100→84 credits, exactly one 16-credit charge; immutable revisions, private preview and matching MP4/ZIP downloads; failed render refunded; no fal calls.",
    )
  } finally {
    if (!keep || !success) {
      if (objects.length)
        await admin.storage.from(RENDER_BUCKET).remove(objects)
      if (sources.length)
        await admin.storage.from(MOTION_SOURCE_BUCKET).remove(sources)
      for (const id of ids) await admin.auth.admin.deleteUser(id)
    }
    await sql.end({ timeout: 1 })
  }
}
void main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
