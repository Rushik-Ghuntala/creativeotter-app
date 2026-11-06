import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { createDatabaseConnection } from "./database.mjs"
import { runOneRender } from "../src/lib/render/worker"
import { renderInputSchema } from "../src/lib/render/contracts"
import { creditSummarySchema } from "../src/lib/credits/contracts"
import type { Database } from "../src/lib/database.types"
const main = async () => {
  const sql = createDatabaseConnection()
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  let userId: string | undefined
  try {
    const email = `render-test-race-${randomUUID()}@example.com`,
      password = `Aa!${randomUUID()}`
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    assert.equal(created.error, null)
    userId = created.data.user!.id
    assert.equal(
      (await client.auth.signInWithPassword({ email, password })).error,
      null,
    )
    const workspace = await client.rpc("ensure_personal_workspace")
    assert.equal(workspace.error, null)
    const ws = workspace.data!.id
    await sql`insert into private.workspace_render_settings(workspace_id,enabled,png_credit_units,mp4_credit_units,pricing_version,valid_until) values(${ws},true,16000,16000,'local-concurrency-test',now()+interval '1 hour')`
    assert.equal((await admin.rpc("render_worker_heartbeat")).error, null)
    assert.equal(
      (
        await admin.rpc("record_credit_grant", {
          target_workspace: ws,
          units: "16000",
          external_event_id: `render-race:${randomUUID()}`,
          reason: "Disposable concurrency test",
        })
      ).error,
      null,
    )
    const balance = () =>
      client
        .rpc("get_credit_summary", { target_workspace: ws })
        .then((result) => creditSummarySchema.parse(result.data))
    const input = renderInputSchema.parse({
      title: "Check a stopped request",
      format: "png",
      html: "<h1>Hello</h1>",
      width: 640,
      height: 800,
    })
    const quotes = await Promise.all(
      [randomUUID(), randomUUID()].map((key) =>
        client.rpc("prepare_render", {
          target_workspace: ws,
          render_input: input,
          request_key: key,
        }),
      ),
    )
    assert.ok(quotes.every((quote) => !quote.error))
    const starts = await Promise.all(
      quotes.map((quote) =>
        client.rpc("start_render", { target_render: quote.data!.id }),
      ),
    )
    assert.equal(starts.filter((result) => !result.error).length, 1)
    assert.equal((await balance()).available_units, "0")
    assert.equal((await balance()).reserved_units, "16000")
    const pending = starts.find((result) => !result.error)!.data!
    assert.ok(
      (
        await client
          .from("render_jobs")
          .update({ state: "succeeded" })
          .eq("id", pending.id)
      ).error,
    )
    assert.ok((await client.rpc("claim_render")).error)
    assert.ok(
      (
        await client.rpc("complete_render", {
          target_render: pending.id,
          lease: randomUUID(),
          bytes: 10,
          digest: "a".repeat(64),
        })
      ).error,
    )
    await sql`update public.workspace_members set role='viewer' where workspace_id=${ws} and user_id=${userId}`
    assert.equal((await runOneRender())?.state, "failed")
    assert.equal((await balance()).available_units, "16000")
    assert.equal((await balance()).reserved_units, "0")
    assert.equal((await balance()).spent_units, "0")
    await sql`update public.workspace_members set role='owner' where workspace_id=${ws} and user_id=${userId}`
    const invalid = await client.rpc("prepare_render", {
      target_workspace: ws,
      render_input: { ...input, width: null } as never,
      request_key: randomUUID(),
    })
    assert.ok(invalid.error)
    const ledger = await admin
      .from("credit_ledger")
      .select("kind")
      .eq("render_job_id", pending.id)
    assert.deepEqual(ledger.data?.map((row) => row.kind).sort(), [
      "release",
      "reserve",
    ])
    process.stdout.write(
      "Passed real shared-wallet concurrency, worker-only authorization, and release after removed preparation permission. No rendering or charge.\n",
    )
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId)
    await sql.end({ timeout: 1 })
  }
}
void main().catch((error) => {
  process.stderr.write(`Render permissions test failed: ${error.message}\n`)
  process.exitCode = 1
})
