import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { createDatabaseConnection } from "./database.mjs"
import {
  prepareNativeGeneration,
  prepareNativeOutput,
  finishNativeOutput,
  getNativeSnapshot,
} from "../src/lib/media/native.ts"
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const sql = createDatabaseConnection(),
  users = [],
  paths = []
let stage = "setup"
try {
  const fixtures = []
  for (let i = 0; i < 2; i++) {
    const email = `native-billing-${randomUUID()}@example.com`,
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
    await sql`insert into private.workspace_generation_limits(workspace_id,enabled,daily_budget_micro_usd) values(${ws.data.id},true,0)`
    fixtures.push({ client, id: ws.data.id, user: created.data.user.id })
  }
  const [a, b] = fixtures
  const input = {
    prompt:
      "Paid native billing fixture. Static validation image, no host generation or provider inference.",
    aspect_ratio: "1:1",
    resolution: null,
    reference_asset_ids: [],
  }
  const quote = (key = randomUUID(), value = input) =>
    prepareNativeGeneration(
      a.client,
      a.id,
      value,
      "other",
      null,
      "image/webp",
      key,
    )
  const summary = async () => {
    const r = await a.client.rpc("get_credit_summary", {
      target_workspace: a.id,
    })
    assert.equal(r.error, null)
    return r.data
  }
  const approve = (id) =>
    a.client.rpc("approve_native_generation", { target_generation: id })
  const claim = (id) =>
    a.client.rpc("claim_native_generation", { target_generation: id })
  stage = "no zero-price or legacy import bypass"
  await assert.rejects(() => quote())
  await sql`insert into private.workspace_credit_prices(workspace_id,model_key,version,credit_units,valid_until,enabled) values(${a.id},'native:image','native-fixture-16',16000,now()+interval '1 hour',true)`
  const legacy = {
    target_workspace: a.id,
    request_key: randomUUID(),
    native_input: input,
    host_name: "other",
    reported_model: null,
    output_mime: "image/webp",
  }
  assert.ok((await a.client.rpc("prepare_native_output", legacy)).error)
  assert.ok((await admin.rpc("prepare_native_output", legacy)).error)
  stage = "quote before generation; fixed inputs and pricing"
  const key = randomUUID()
  const [q1, qAgain] = await Promise.all([quote(key), quote(key)])
  assert.equal(q1.generation_id, qAgain.generation_id)
  assert.equal(q1.state, "awaiting_approval")
  assert.equal(q1.credit_units, "16000")
  assert.equal(q1.credit_status, "quoted")
  await assert.rejects(() => quote(key, { ...input, prompt: "Changed input" }))
  await assert.rejects(() =>
    getNativeSnapshot(b.client, b.id, q1.generation_id),
  )
  const n = await a.client
    .from("native_generations")
    .select("asset_id")
    .eq("id", q1.generation_id)
    .single()
  const asset = await a.client
    .from("media_assets")
    .select("storage_path")
    .eq("id", n.data.asset_id)
    .single()
  assert.ok(
    (
      await a.client.storage
        .from("creativeotter-media")
        .createSignedUploadUrl(asset.data.storage_path)
    ).error,
    "No upload authorization before a paid claim",
  )
  assert.ok((await claim(q1.generation_id)).error)
  assert.ok(
    (await approve(q1.generation_id)).error?.message.includes(
      "Insufficient CreativeOtter credits",
    ),
  )
  assert.equal((await summary()).available_units, "0")
  assert.equal((await summary()).reserved_units, "0")
  await sql`update private.workspace_credit_prices set credit_units=32000,version='changed-fixture' where workspace_id=${a.id}`
  assert.equal((await quote(key)).credit_units, "16000")
  await sql`update private.workspace_credit_prices set credit_units=16000,version='native-fixture-16' where workspace_id=${a.id}`
  const q2 = await quote()
  const clientId = `native-client-${randomUUID()}`
  assert.equal(
    (
      await a.client.from("client_grants").insert({
        user_id: a.user,
        workspace_id: a.id,
        client_id: clientId,
        client_name: "Disposable native client",
        redirect_uri: "http://127.0.0.1/callback",
        permissions: ["account:read", "media:read", "media:prepare"],
      })
    ).error,
    null,
  )
  await assert.rejects(() =>
    sql.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: a.user, role: "authenticated", client_id: clientId, aud: ["authenticated", `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp`] })},true)`
      return tx`select public.approve_native_generation(${q1.generation_id})`
    }),
  )
  assert.equal(
    (
      await admin.rpc("record_credit_grant", {
        target_workspace: a.id,
        units: "16000",
        external_event_id: randomUUID(),
        reason: "Disposable native billing fixture",
      })
    ).error,
    null,
  )
  stage = "concurrent approval cannot overspend; one execution claim"
  const approvals = await Promise.all([
    approve(q1.generation_id),
    approve(q2.generation_id),
  ])
  assert.equal(approvals.filter((r) => !r.error).length, 1)
  const approved = approvals.find((r) => !r.error).data
  const unused = approvals[0].error ? q1 : q2
  assert.equal((await approve(approved.id)).data.id, approved.id)
  assert.equal((await summary()).available_units, "0")
  assert.equal((await summary()).reserved_units, "16000")
  const claims = await Promise.all([claim(approved.id), claim(approved.id)])
  assert.equal(claims.filter((r) => !r.error).length, 1)
  const ticket = claims.find((r) => !r.error).data
  assert.equal(ticket.claimed, true)
  assert.ok(
    (
      await b.client.rpc("claim_native_generation", {
        target_generation: approved.id,
      })
    ).error,
  )
  await assert.rejects(() =>
    prepareNativeOutput(a.client, a.id, approved.id, randomUUID()),
  )
  stage = "validated saved delivery charges once"
  const upload = await prepareNativeOutput(
    a.client,
    a.id,
    approved.id,
    ticket.execution_token,
  )
  const row = await admin
    .from("media_assets")
    .select("storage_path")
    .eq("id", upload.asset_id)
    .single()
  paths.push(row.data.storage_path)
  assert.ok(
    (
      await admin.rpc("complete_paid_native_output", {
        target_generation: approved.id,
        expected_execution_token: ticket.execution_token,
        asset_metadata: {},
      })
    ).error,
  )
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
    a.client,
    a.id,
    approved.id,
    ticket.execution_token,
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
  assert.equal(
    (
      await finishNativeOutput(
        a.client,
        a.id,
        approved.id,
        ticket.execution_token,
      )
    ).credit_status,
    "charged",
  )
  let wallet = await summary()
  assert.equal(wallet.available_units, "0")
  assert.equal(wallet.reserved_units, "0")
  assert.equal(wallet.spent_units, "16000")
  assert.equal(wallet.history.filter((r) => r.kind === "charge").length, 1)
  assert.ok(
    (
      await admin.rpc("confirm_native_failure", {
        target_generation: approved.id,
        reason: "Cannot release a successful result",
      })
    ).error,
  )
  stage =
    "unclaimed cancellation releases once; claimed work cannot self-refund"
  assert.equal(
    (
      await admin.rpc("record_credit_grant", {
        target_workspace: a.id,
        units: "16000",
        external_event_id: randomUUID(),
        reason: "Disposable cancellation fixture",
      })
    ).error,
    null,
  )
  assert.equal((await approve(unused.generation_id)).error, null)
  assert.equal(
    (
      await a.client.rpc("cancel_native_generation", {
        target_generation: unused.generation_id,
      })
    ).error,
    null,
  )
  assert.equal(
    (
      await a.client.rpc("cancel_native_generation", {
        target_generation: unused.generation_id,
      })
    ).error,
    null,
  )
  assert.equal((await summary()).available_units, "16000")
  assert.ok((await claim(unused.generation_id)).error)
  const q3 = await quote()
  assert.equal((await approve(q3.generation_id)).error, null)
  const t3 = (await claim(q3.generation_id)).data
  assert.equal(
    (
      await a.client.rpc("report_native_outcome", {
        target_generation: q3.generation_id,
        expected_execution_token: t3.execution_token,
        detail: "Unverified native failure fixture",
      })
    ).error,
    null,
  )
  assert.equal((await summary()).reserved_units, "16000")
  assert.ok(
    (
      await a.client.rpc("cancel_native_generation", {
        target_generation: q3.generation_id,
      })
    ).error,
  )
  assert.ok(
    (
      await a.client.rpc("confirm_native_failure", {
        target_generation: q3.generation_id,
        reason: "Client must not issue a refund",
      })
    ).error,
  )
  assert.equal(
    (
      await admin.rpc("confirm_native_failure", {
        target_generation: q3.generation_id,
        reason: "Trusted confirmed fixture failure",
      })
    ).error,
    null,
  )
  assert.equal(
    (
      await admin.rpc("confirm_native_failure", {
        target_generation: q3.generation_id,
        reason: "Repeated fixture review",
      })
    ).error,
    null,
  )
  wallet = await summary()
  assert.equal(wallet.available_units, "16000")
  assert.equal(wallet.reserved_units, "0")
  assert.equal(wallet.spent_units, "16000")
  assert.equal(wallet.history.filter((r) => r.kind === "release").length, 2)
  stage = "expired native quote cannot reserve credits"
  await sql`update private.workspace_credit_prices set valid_until=now()+interval '1 second' where workspace_id=${a.id}`
  const expired = await quote()
  await sql`select pg_sleep(1.1)`
  assert.ok((await approve(expired.generation_id)).error)
  assert.equal((await summary()).available_units, "16000")
  stage = "no provider usage and ledger totals agree"
  assert.equal(
    (
      await sql`select count(*)::int as count from public.generation_jobs where workspace_id=${a.id}`
    )[0].count,
    0,
  )
  const totals = (
    await sql`select sum(delta_available)::text as available,sum(delta_reserved)::text as reserved from public.credit_ledger where workspace_id=${a.id}`
  )[0]
  assert.equal(totals.available, "16000")
  assert.equal(totals.reserved, "0")

  stage =
    "native and API approvals share one balance; cancel and claim serialize"
  await sql`update private.workspace_generation_limits set daily_budget_micro_usd=1000000 where workspace_id=${b.id}`
  for (const model of ["native:image", "image/nano-banana-2"])
    await sql`insert into private.workspace_credit_prices(workspace_id,model_key,version,credit_units,valid_until,enabled) values(${b.id},${model},'mixed-route-fixture',16000,now()+interval '1 hour',true)`
  assert.equal(
    (
      await admin.rpc("record_credit_grant", {
        target_workspace: b.id,
        units: "16000",
        external_event_id: randomUUID(),
        reason: "Disposable mixed-route fixture",
      })
    ).error,
    null,
  )
  const nativeB = await prepareNativeGeneration(
    b.client,
    b.id,
    input,
    "other",
    null,
    "image/webp",
    randomUUID(),
  )
  const providerB = await b.client.rpc("prepare_image_quote", {
    target_workspace: b.id,
    quote_input: {
      prompt: "Mixed-route accounting fixture",
      aspect_ratio: "4:5",
      resolution: "1K",
      reference_asset_ids: [],
    },
    request_key: randomUUID(),
  })
  assert.equal(providerB.error, null)
  const mixed = await Promise.all([
    b.client.rpc("approve_native_generation", {
      target_generation: nativeB.generation_id,
    }),
    b.client.rpc("approve_image_quote", { target_quote: providerB.data.id }),
  ])
  assert.equal(mixed.filter((r) => !r.error).length, 1)
  if (!mixed[0].error)
    assert.equal(
      (
        await b.client.rpc("cancel_native_generation", {
          target_generation: nativeB.generation_id,
        })
      ).error,
      null,
    )
  else
    assert.equal(
      (
        await admin.rpc("mark_image_job_failure", {
          target_job: mixed[1].data.id,
          next_state: "failed",
          safe_message: "Confirmed mixed-route fixture rejection",
        })
      ).error,
      null,
    )
  const race = await prepareNativeGeneration(
    b.client,
    b.id,
    input,
    "other",
    null,
    "image/webp",
    randomUUID(),
  )
  assert.equal(
    (
      await b.client.rpc("approve_native_generation", {
        target_generation: race.generation_id,
      })
    ).error,
    null,
  )
  const claimCancel = await Promise.all([
    b.client.rpc("claim_native_generation", {
      target_generation: race.generation_id,
    }),
    b.client.rpc("cancel_native_generation", {
      target_generation: race.generation_id,
    }),
  ])
  assert.equal(claimCancel.filter((r) => !r.error).length, 1)
  if (!claimCancel[0].error)
    assert.equal(
      (
        await admin.rpc("confirm_native_failure", {
          target_generation: race.generation_id,
          reason:
            "Confirmed claim/cancel race fixture, no actual tool execution",
        })
      ).error,
      null,
    )
  const finalB = await b.client.rpc("get_credit_summary", {
    target_workspace: b.id,
  })
  assert.equal(finalB.data.available_units, "16000")
  assert.equal(finalB.data.reserved_units, "0")
  process.stdout.write(
    "Passed: mandatory native pricing, legacy-route rejection, sufficient-credit/browser gates, fixed quote, concurrent reservation, one execution claim, paid private delivery, single settlement, cancellation, uncertain holds and trusted failure release. No native inference, provider calls or production credit grants.\n",
  )
} catch (error) {
  process.stderr.write(
    `Native billing test failed at ${stage}: ${error instanceof Error ? error.message : "unknown error"}\n`,
  )
  process.exitCode = 1
} finally {
  if (paths.length)
    assert.equal(
      (await admin.storage.from("creativeotter-media").remove(paths)).error,
      null,
    )
  for (const user of users)
    assert.equal((await admin.auth.admin.deleteUser(user)).error, null)
  await sql.end({ timeout: 1 })
  process.stdout.write(
    "Removed disposable native billing users, credit rows and media.\n",
  )
}
