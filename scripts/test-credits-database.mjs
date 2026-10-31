import assert from "node:assert/strict"
import { randomUUID, createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { createDatabaseConnection } from "./database.mjs"
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const sql = createDatabaseConnection()
const users = []
const paths = []
let stage = "setup"
try {
  const fixtures = []
  for (let i = 0; i < 2; i++) {
    const email = `otter-credits-${randomUUID()}@example.com`,
      password = `Aa!${randomUUID()}`
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    assert.equal(created.error, null)
    users.push(created.data.user.id)
    const client = createClient(
      url,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    assert.equal(
      (await client.auth.signInWithPassword({ email, password })).error,
      null,
    )
    const workspace = await client.rpc("ensure_personal_workspace")
    assert.equal(workspace.error, null)
    await sql`insert into private.workspace_generation_limits(workspace_id,enabled,daily_budget_micro_usd) values(${workspace.data.id},true,10000000)`
    await sql`insert into private.workspace_credit_prices(workspace_id,model_key,version,credit_units,valid_until,enabled) values(${workspace.data.id},'image/nano-banana-2','test-16-credit-fixture',16000,now()+interval '1 hour',true)`
    fixtures.push({ client, id: workspace.data.id, user: created.data.user.id })
  }
  const [a, b] = fixtures
  const summary = async () => {
    const r = await a.client.rpc("get_credit_summary", {
      target_workspace: a.id,
    })
    assert.equal(r.error, null)
    return r.data
  }
  const initial = await summary()
  assert.equal(initial.available_units, "0")
  assert.equal(initial.reserved_units, "0")
  assert.ok(
    (await b.client.rpc("get_credit_summary", { target_workspace: a.id }))
      .error,
  )
  assert.deepEqual(
    (
      await b.client
        .from("credit_accounts")
        .select("*")
        .eq("workspace_id", a.id)
    ).data,
    [],
  )
  assert.ok(
    (
      await a.client
        .from("credit_accounts")
        .update({ available_units: 99999999 })
        .eq("workspace_id", a.id)
    ).error,
  )
  assert.ok(
    (
      await a.client.rpc("record_credit_grant", {
        target_workspace: a.id,
        units: "16000",
        external_event_id: randomUUID(),
        reason: "Unauthorized fixture",
      })
    ).error,
  )
  stage = "idempotent trusted issuance"
  const event = randomUUID()
  const grant = () =>
    admin.rpc("record_credit_grant", {
      target_workspace: a.id,
      units: "16000",
      external_event_id: event,
      reason: "Disposable test credits, not a purchase",
    })
  const grants = await Promise.all([grant(), grant()])
  grants.forEach((r) => assert.equal(r.error, null))
  assert.equal(grants[0].data.entry_id, grants[1].data.entry_id)
  assert.equal((await summary()).available_units, "16000")
  assert.ok(
    (
      await admin.rpc("record_credit_grant", {
        target_workspace: a.id,
        units: "17000",
        external_event_id: event,
        reason: "Disposable test credits, not a purchase",
      })
    ).error,
  )
  assert.ok(
    (
      await admin.rpc("record_credit_grant", {
        target_workspace: b.id,
        units: "16000",
        external_event_id: event,
        reason: "Disposable test credits, not a purchase",
      })
    ).error,
  )
  const input = {
    prompt: "Credit accounting fixture. No provider inference.",
    aspect_ratio: "4:5",
    resolution: "1K",
    reference_asset_ids: [],
  }
  const makeQuote = async () => {
    const q = await a.client.rpc("prepare_image_quote", {
      target_workspace: a.id,
      quote_input: input,
      request_key: randomUUID(),
    })
    assert.equal(q.error, null)
    return q.data
  }
  const [q1, q2] = await Promise.all([makeQuote(), makeQuote()])
  assert.equal(q1.credit_units, 16000)
  await sql`update private.workspace_credit_prices set credit_units=32000,version='different-fixture-price' where workspace_id=${a.id}`
  assert.equal(
    (
      await a.client
        .from("generation_quotes")
        .select("credit_units,credit_pricing_version")
        .eq("id", q1.id)
        .single()
    ).data.credit_units,
    16000,
  )
  await sql`update private.workspace_credit_prices set credit_units=16000,version='test-16-credit-fixture' where workspace_id=${a.id}`
  stage = "concurrent approvals cannot overspend a shared wallet"
  const approvals = await Promise.all(
    [q1, q2].map((q) =>
      a.client.rpc("approve_image_quote", { target_quote: q.id }),
    ),
  )
  assert.equal(approvals.filter((r) => !r.error).length, 1)
  assert.equal(
    approvals.filter((r) =>
      r.error?.message.includes("Insufficient CreativeOtter credits"),
    ).length,
    1,
  )
  const job = approvals.find((r) => !r.error).data
  const rejectedQuote = approvals[0].error ? q1 : q2
  assert.equal((await summary()).available_units, "0")
  assert.equal((await summary()).reserved_units, "16000")
  const repeated = await a.client.rpc("approve_image_quote", {
    target_quote: job.quote_id,
  })
  assert.equal(repeated.error, null)
  assert.equal(repeated.data.id, job.id)
  assert.equal(
    (await summary()).history.filter((e) => e.kind === "reserve").length,
    1,
  )
  stage = "Codex and Claude see the same workspace wallet"
  const ids = [`codex-credit-${randomUUID()}`, `claude-credit-${randomUUID()}`]
  for (const id of ids) {
    assert.equal(
      (
        await a.client.from("client_grants").insert({
          user_id: a.user,
          workspace_id: a.id,
          client_id: id,
          client_name: "Disposable client",
          redirect_uri: "http://127.0.0.1/callback",
          permissions: ["account:read"],
        })
      ).error,
      null,
    )
  }
  for (const id of ids) {
    const result = await sql.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: a.user, role: "authenticated", client_id: id, aud: ["authenticated", `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp`] })},true)`
      return tx`select public.get_credit_summary(${a.id}) as data`
    })
    assert.equal(result[0].data.reserved_units, "16000")
    assert.equal(result[0].data.available_units, "0")
  }
  stage = "confirmed failure releases exactly once"
  assert.equal(
    (
      await admin.rpc("mark_image_job_failure", {
        target_job: job.id,
        next_state: "failed",
        safe_message: "Confirmed test rejection",
      })
    ).error,
    null,
  )
  assert.equal(
    (
      await admin.rpc("mark_image_job_failure", {
        target_job: job.id,
        next_state: "failed",
        safe_message: "Repeated fixture notification",
      })
    ).error,
    null,
  )
  let current = await summary()
  assert.equal(current.available_units, "16000")
  assert.equal(current.reserved_units, "0")
  assert.equal(current.history.filter((e) => e.kind === "release").length, 1)
  assert.ok(
    (
      await admin
        .from("generation_jobs")
        .update({ state: "submitted" })
        .eq("id", job.id)
    ).error,
  )
  stage = "uncertain outcome and save failures keep the reservation"
  const approved = await a.client.rpc("approve_image_quote", {
    target_quote: rejectedQuote.id,
  })
  assert.equal(approved.error, null)
  const second = approved.data
  assert.equal(
    (await admin.rpc("claim_image_job", { target_job: second.id })).error,
    null,
  )
  assert.equal(
    (
      await admin.rpc("mark_image_job_failure", {
        target_job: second.id,
        next_state: "needs_reconciliation",
        safe_message: "Unknown test outcome",
      })
    ).error,
    null,
  )
  current = await summary()
  assert.equal(current.available_units, "0")
  assert.equal(current.reserved_units, "16000")
  assert.equal(
    (
      await admin.rpc("mark_image_job_failure", {
        target_job: second.id,
        next_state: "save_failed",
        safe_message: "Test ingestion not ready",
      })
    ).error,
    null,
  )
  assert.equal((await summary()).reserved_units, "16000")
  stage = "saved fulfillment charges once"
  assert.equal(
    (
      await admin
        .from("generation_jobs")
        .update({
          state: "submitted",
          provider_request_id: "fixture-only-no-inference",
        })
        .eq("id", second.id)
    ).error,
    null,
  )
  assert.ok(
    (
      await admin.rpc("complete_image_job", {
        target_job: second.id,
        asset_metadata: {},
      })
    ).error,
    "No debit before a saved object",
  )
  const bytes = await readFile("public/creativeotter.png")
  const path = `${a.id}/outputs/${second.id}.png`
  paths.push(path)
  assert.equal(
    (
      await admin.storage
        .from("creativeotter-media")
        .upload(path, bytes, { contentType: "image/png" })
    ).error,
    null,
  )
  const metadata = {
    size_bytes: bytes.length,
    width: 1280,
    height: 1280,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
  const done = await admin.rpc("complete_image_job", {
    target_job: second.id,
    asset_metadata: metadata,
  })
  assert.equal(done.error, null)
  assert.equal(done.data.credit_status, "charged")
  assert.equal(
    (
      await admin.rpc("complete_image_job", {
        target_job: second.id,
        asset_metadata: metadata,
      })
    ).error,
    null,
  )
  assert.equal(
    (
      await admin.rpc("mark_image_job_failure", {
        target_job: second.id,
        next_state: "failed",
        safe_message: "Late test notification",
      })
    ).error,
    null,
  )
  current = await summary()
  assert.equal(current.available_units, "0")
  assert.equal(current.reserved_units, "0")
  assert.equal(current.spent_units, "16000")
  assert.equal(current.history.filter((e) => e.kind === "charge").length, 1)
  assert.equal(current.history.filter((e) => e.kind === "release").length, 1)
  stage = "ledger and wallet agree; ledger is immutable"
  const rows =
    await sql`select sum(delta_available)::text as available,sum(delta_reserved)::text as reserved from public.credit_ledger where workspace_id=${a.id}`
  assert.equal(rows[0].available, current.available_units)
  assert.equal(rows[0].reserved, current.reserved_units)
  assert.ok(
    (await a.client.from("credit_ledger").delete().eq("workspace_id", a.id))
      .error,
  )
  await assert.rejects(
    () =>
      sql`update public.credit_ledger set note='changed' where workspace_id=${a.id}`,
  )
  await assert.rejects(
    () => sql`delete from public.credit_ledger where workspace_id=${a.id}`,
  )
  stage = "unconfigured retail pricing fails closed"
  await sql`update private.workspace_credit_prices set enabled=false where workspace_id=${b.id}`
  assert.ok(
    (
      await b.client.rpc("prepare_image_quote", {
        target_workspace: b.id,
        quote_input: input,
        request_key: randomUUID(),
      })
    ).error,
  )
  process.stdout.write(
    "Passed: isolated shared credit wallets, idempotent grants, immutable quotes, concurrent balance protection, one reserve/charge/release per job, uncertain-result holds and cross-client balances. No provider inference or real payments.\n",
  )
} catch (error) {
  process.stderr.write(
    `Credit test failed at ${stage}: ${error instanceof Error ? error.message : "unknown error"}\n`,
  )
  process.exitCode = 1
} finally {
  if (paths.length)
    assert.equal(
      (await admin.storage.from("creativeotter-media").remove(paths)).error,
      null,
    )
  for (const id of users)
    assert.equal((await admin.auth.admin.deleteUser(id)).error, null)
  await sql.end({ timeout: 1 })
  process.stdout.write(
    "Removed isolated credit fixtures and media. No production credits were issued.\n",
  )
}
