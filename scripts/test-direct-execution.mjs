import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { createDatabaseConnection } from "./database.mjs"
import {
  prepareNativeGeneration,
  prepareNativeOutput,
  finishNativeOutput,
} from "../src/lib/media/native.ts"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const sql = createDatabaseConnection()
const users = [],
  paths = []
let stage = "setup"
try {
  const fixtures = []
  for (let i = 0; i < 2; i++) {
    const email = `direct-execution-${randomUUID()}@example.com`,
      password = `Aa!${randomUUID()}`
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    assert.equal(created.error, null)
    users.push(created.data.user.id)
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    assert.equal(
      (await client.auth.signInWithPassword({ email, password })).error,
      null,
    )
    const ws = await client.rpc("ensure_personal_workspace")
    assert.equal(ws.error, null)
    const f = {
      client,
      id: ws.data.id,
      user: created.data.user.id,
      app: `direct-${randomUUID()}`,
      other: `direct-${randomUUID()}`,
    }
    await sql`insert into private.workspace_generation_limits(workspace_id,enabled,daily_budget_micro_usd) values(${f.id},true,1000000)`
    await sql`insert into private.workspace_credit_prices(workspace_id,model_key,version,credit_units,valid_until,enabled) values(${f.id},'native:image','direct-fixture',16000,now()+interval '1 hour',true),(${f.id},'image/nano-banana-2','direct-fixture',16000,now()+interval '1 hour',true)`
    for (const clientId of [f.app, f.other])
      assert.equal(
        (
          await client.from("client_grants").insert({
            user_id: f.user,
            workspace_id: f.id,
            client_id: clientId,
            client_name: "Disposable direct test",
            redirect_uri: "http://127.0.0.1/callback",
            permissions: ["account:read", "media:read", "media:prepare"],
          })
        ).error,
        null,
      )
    fixtures.push(f)
  }
  const [a, b] = fixtures
  const asMcp = (f, run, app = f.app) =>
    sql.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: f.user, role: "authenticated", client_id: app, aud: ["authenticated", `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp`] })},true)`
      const rows = await run(tx)
      return rows[0].result
    })
  const input = {
    prompt: "Direct billing test; static fixture, no model inference",
    aspect_ratio: "1:1",
    resolution: null,
    reference_asset_ids: [],
  }
  const summary = async (f) =>
    (await f.client.rpc("get_credit_summary", { target_workspace: f.id })).data
  const grant = async (f, units) =>
    assert.equal(
      (
        await admin.rpc("record_credit_grant", {
          target_workspace: f.id,
          units,
          external_event_id: randomUUID(),
          reason: "Disposable direct execution test",
        })
      ).error,
      null,
    )
  const native = async (f) =>
    asMcp(
      f,
      (tx) =>
        tx`select public.prepare_native_generation(${f.id},${randomUUID()},${sql.json(input)},'codex',null,'image/webp') as result`,
    )
  const claim = (f, id, app = f.app) =>
    asMcp(
      f,
      (tx) => tx`select public.claim_native_generation(${id}) as result`,
      app,
    )
  const provider = async (f) =>
    asMcp(
      f,
      (tx) =>
        tx`select public.prepare_image_quote(${f.id},${sql.json({ ...input, resolution: "1K" })},${randomUUID()}) as result`,
    )
  const start = (f, id, app = f.app) =>
    asMcp(
      f,
      (tx) => tx`select public.start_image_generation(${id}) as result`,
      app,
    )
  const failNative = async (id) =>
    assert.equal(
      (
        await admin.rpc("confirm_native_failure", {
          target_generation: id,
          reason: "Confirmed disposable test; no inference",
        })
      ).error,
      null,
    )
  const failJob = async (id) =>
    assert.equal(
      (
        await admin.rpc("mark_image_job_failure", {
          target_job: id,
          next_state: "failed",
          safe_message: "Confirmed disposable test; no provider submission",
        })
      ).error,
      null,
    )

  stage = "quote-only spends nothing; insufficient funds rolls back claim"
  const nq = await native(a),
    pq = await provider(a)
  assert.equal(nq.state, "awaiting_approval")
  assert.equal((await summary(a)).reserved_units, "0")
  await assert.rejects(
    () => claim(a, nq.id),
    /Insufficient CreativeOtter credits/,
  )
  await assert.rejects(
    () => start(a, pq.id),
    /Insufficient CreativeOtter credits/,
  )
  assert.equal((await summary(a)).reserved_units, "0")
  stage = "original OAuth client binding and permission enforcement"
  await grant(a, "16000")
  await assert.rejects(() => claim(a, nq.id, a.other), /access denied/)
  await assert.rejects(() => claim(b, nq.id), /access denied/)
  await assert.rejects(() => start(a, pq.id, a.other), /another application/)
  await assert.rejects(() => start(b, pq.id), /access denied/)
  await sql`update public.client_grants set revoked_at=now() where user_id=${a.user} and client_id=${a.app}`
  await assert.rejects(() => claim(a, nq.id), /access denied/)
  await assert.rejects(() => start(a, pq.id), /access denied/)
  await sql`update public.client_grants set revoked_at=null where user_id=${a.user} and client_id=${a.app}`
  stage = "native/API direct starts race on one shared balance"
  const mixed = await Promise.allSettled([claim(a, nq.id), start(a, pq.id)])
  assert.equal(mixed.filter((x) => x.status === "fulfilled").length, 1)
  assert.equal((await summary(a)).available_units, "0")
  assert.equal((await summary(a)).reserved_units, "16000")
  if (mixed[0].status === "fulfilled") await failNative(nq.id)
  else await failJob(mixed[1].value.id)
  stage = "native direct claim is one-use without browser approval"
  const q2 = await native(a)
  const concurrent = await Promise.allSettled([
    claim(a, q2.id),
    claim(a, q2.id),
  ])
  assert.equal(concurrent.filter((x) => x.status === "fulfilled").length, 1)
  assert.equal(
    concurrent.find((x) => x.status === "fulfilled").value.claimed,
    true,
  )
  assert.equal((await summary(a)).reserved_units, "16000")
  await failNative(q2.id)
  stage = "provider direct start idempotency and operator budget enforcement"
  await sql`update private.workspace_generation_limits set daily_budget_micro_usd=0 where workspace_id=${a.id}`
  const p2 = await provider(a)
  await assert.rejects(() => start(a, p2.id), /budget/)
  assert.equal((await summary(a)).reserved_units, "0")
  await sql`update private.workspace_generation_limits set daily_budget_micro_usd=1000000 where workspace_id=${a.id}`
  const jobs = await Promise.all([start(a, p2.id), start(a, p2.id)])
  assert.equal(jobs[0].id, jobs[1].id)
  assert.equal((await summary(a)).reserved_units, "16000")
  await sql`update public.client_grants set permissions=array['account:read','media:read'] where user_id=${a.user} and client_id=${a.app}`
  await assert.rejects(() => start(a, p2.id), /access denied/)
  await failJob(jobs[0].id)

  stage = "disabled execution and expired native quotes cannot reserve"
  const disabled = await native(b)
  await grant(b, "16000")
  await sql`update private.workspace_generation_limits set enabled=false where workspace_id=${b.id}`
  await assert.rejects(() => claim(b, disabled.id), /disabled/)
  assert.equal((await summary(b)).reserved_units, "0")
  await sql`update private.workspace_generation_limits set enabled=true where workspace_id=${b.id}`
  await sql`update private.workspace_credit_prices set valid_until=now()+interval '1 second' where workspace_id=${b.id} and model_key='native:image'`
  const expired = await native(b)
  await sql`select pg_sleep(1.1)`
  await assert.rejects(() => claim(b, expired.id), /expired/)
  assert.equal((await summary(b)).reserved_units, "0")
  await sql`update private.workspace_credit_prices set valid_until=now()+interval '1 hour' where workspace_id=${b.id}`

  stage =
    "direct native saved delivery, download byte identity and single 16-credit settlement"
  const webQuote = await prepareNativeGeneration(
    b.client,
    b.id,
    input,
    "codex",
    null,
    "image/webp",
    randomUUID(),
  )
  const ticket = await b.client.rpc("claim_native_generation", {
    target_generation: webQuote.generation_id,
  })
  assert.equal(ticket.error, null)
  const upload = await prepareNativeOutput(
    b.client,
    b.id,
    webQuote.generation_id,
    ticket.data.execution_token,
  )
  const row = await admin
    .from("media_assets")
    .select("storage_path")
    .eq("id", upload.asset_id)
    .single()
  paths.push(row.data.storage_path)
  const bytes = await readFile("public/creativeotter-widget.webp")
  assert.ok(
    (
      await fetch(upload.signed_url, {
        method: "PUT",
        headers: { "Content-Type": "image/webp" },
        body: bytes,
      })
    ).ok,
  )
  const done = await finishNativeOutput(
    b.client,
    b.id,
    webQuote.generation_id,
    ticket.data.execution_token,
  )
  assert.equal(done.state, "succeeded")
  assert.equal(done.credit_status, "charged")
  assert.equal(done.credit_units, "16000")
  assert.deepEqual(
    new Uint8Array(
      await (await fetch(done.outputs[0].download_url)).arrayBuffer(),
    ),
    new Uint8Array(bytes),
  )
  await finishNativeOutput(
    b.client,
    b.id,
    webQuote.generation_id,
    ticket.data.execution_token,
  )
  const wallet = await summary(b)
  assert.equal(wallet.available_units, "0")
  assert.equal(wallet.reserved_units, "0")
  assert.equal(wallet.spent_units, "16000")
  assert.equal(wallet.history.filter((x) => x.kind === "charge").length, 1)
  assert.equal(wallet.history.filter((x) => x.kind === "reserve").length, 1)
  process.stdout.write(
    "Passed: quote-only no spend; direct native/API start; original OAuth client and revoked grant checks; insufficient funds; shared-wallet race; single native claim/provider job; budget gate; direct saved delivery/download; exactly one 16-credit charge. No inference or production credits used.\n",
  )
} catch (error) {
  process.stderr.write(
    `Direct execution test failed at ${stage}: ${error.message}\n`,
  )
  process.exitCode = 1
} finally {
  if (paths.length)
    await admin.storage.from("creativeotter-media").remove(paths)
  for (const id of users) await admin.auth.admin.deleteUser(id)
  await sql.end({ timeout: 1 })
  process.stdout.write(
    "Removed disposable direct-execution users and images.\n",
  )
}
