import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { createDatabaseConnection } from "./database.mjs"
import { beginMediaUpload, finishMediaUpload } from "../src/lib/media/assets.ts"

const base = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createClient(base, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const sql = createDatabaseConnection()
const users = []
const paths = []
let stage = "setup"
try {
  const fixtures = []
  for (let i = 0; i < 2; i++) {
    const email = `creativeotter-media-${randomUUID()}@example.com`
    const password = `Aa!${randomUUID()}`
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    assert.equal(created.error, null)
    users.push(created.data.user.id)
    const client = createClient(base, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    assert.equal(
      (await client.auth.signInWithPassword({ email, password })).error,
      null,
    )
    const workspace = await client.rpc("ensure_personal_workspace")
    assert.equal(workspace.error, null)
    await sql`insert into private.workspace_generation_limits(workspace_id,enabled,daily_budget_micro_usd) values(${workspace.data.id},true,1000000)`
    await sql`insert into private.workspace_credit_prices(workspace_id,model_key,version,credit_units,valid_until,enabled) values(${workspace.data.id},'image/nano-banana-2','fixture-only',16000,now()+interval '1 hour',true)`
    assert.equal(
      (
        await admin.rpc("record_credit_grant", {
          target_workspace: workspace.data.id,
          units: "1000000",
          external_event_id: `test-${randomUUID()}`,
          reason: "Disposable integration fixture",
        })
      ).error,
      null,
    )
    fixtures.push({
      client,
      userId: created.data.user.id,
      workspaceId: workspace.data.id,
    })
  }
  const [a, b] = fixtures
  const input = {
    prompt: "Scoped reference fixture",
    aspect_ratio: "1:1",
    resolution: null,
    reference_asset_ids: [],
  }
  stage = "private reference upload and tenant isolation"
  const one = await beginMediaUpload(
    a.client,
    a.workspaceId,
    "Reference fixture",
    "image/webp",
  )
  paths.push(one.path)
  const bytes = await readFile("public/creativeotter-widget.webp")
  assert.ok(
    (
      await fetch(one.signed_url, {
        method: "PUT",
        headers: { "Content-Type": "image/webp" },
        body: bytes,
      })
    ).ok,
  )
  const ready = await finishMediaUpload(a.client, a.workspaceId, one.asset_id)
  assert.equal(ready.id, one.asset_id)
  await assert.rejects(() =>
    finishMediaUpload(b.client, b.workspaceId, one.asset_id),
  )
  stage = "provider quote binding and browser-only approval"
  const providerInput = {
    prompt: "Provider fixture; no inference is submitted",
    aspect_ratio: "4:5",
    resolution: "1K",
    reference_asset_ids: [one.asset_id],
  }
  const requestKey = randomUUID()
  const quote = await a.client.rpc("prepare_image_quote", {
    target_workspace: a.workspaceId,
    quote_input: providerInput,
    request_key: requestKey,
  })
  assert.equal(quote.error, null)
  assert.equal(quote.data.max_cost_micro_usd, 80000)
  const again = await a.client.rpc("prepare_image_quote", {
    target_workspace: a.workspaceId,
    quote_input: providerInput,
    request_key: requestKey,
  })
  assert.equal(again.data.id, quote.data.id)
  assert.ok(
    (
      await a.client.rpc("prepare_image_quote", {
        target_workspace: a.workspaceId,
        quote_input: { ...providerInput, prompt: "Changed" },
        request_key: requestKey,
      })
    ).error,
  )
  assert.ok(
    (
      await b.client.rpc("prepare_image_quote", {
        target_workspace: b.workspaceId,
        quote_input: providerInput,
        request_key: randomUUID(),
      })
    ).error,
  )
  const clientId = `media-fixture-${randomUUID()}`
  assert.equal(
    (
      await a.client.from("client_grants").insert({
        user_id: a.userId,
        workspace_id: a.workspaceId,
        client_id: clientId,
        client_name: "Disposable media access fixture",
        redirect_uri: "http://127.0.0.1/callback",
        permissions: ["account:read"],
      })
    ).error,
    null,
  )
  const asMcp = async (callback) =>
    sql.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: a.userId, role: "authenticated", client_id: clientId, aud: ["authenticated", `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp`] })},true)`
      return callback(tx)
    })
  await assert.rejects(() =>
    asMcp(
      (tx) =>
        tx`select public.prepare_native_output(${a.workspaceId},${randomUUID()},${sql.json(input)},'other',null,'image/webp')`,
    ),
  )
  await sql`update public.client_grants set permissions=array['account:read','media:read','media:prepare'] where user_id=${a.userId} and client_id=${clientId}`
  await assert.rejects(() =>
    asMcp((tx) => tx`select public.approve_image_quote(${quote.data.id})`),
  )
  stage = "approval and provider submission are each idempotent"
  const approvals = await Promise.all(
    [0, 1].map(() =>
      a.client.rpc("approve_image_quote", { target_quote: quote.data.id }),
    ),
  )
  approvals.forEach((result) => assert.equal(result.error, null))
  assert.equal(approvals[0].data.id, approvals[1].data.id)
  const jobId = approvals[0].data.id
  const claim = await admin.rpc("claim_image_job", { target_job: jobId })
  assert.equal(claim.error, null)
  assert.equal(claim.data.state, "submitting")
  assert.equal(
    (await admin.rpc("claim_image_job", { target_job: jobId })).data,
    null,
  )
  await admin.rpc("mark_image_job_failure", {
    target_job: jobId,
    next_state: "needs_reconciliation",
    safe_message: "Disposable unknown-outcome fixture",
  })
  assert.equal(
    (await admin.rpc("claim_image_job", { target_job: jobId })).data,
    null,
  )
  process.stdout.write(
    "Passed: scoped reference uploads, immutable/idempotent provider requests, private saved output, tenant isolation, scoped permissions, browser-only approval and no automatic provider resubmission.\n",
  )
} catch (error) {
  process.stderr.write(
    `Media database test failed at ${stage}: ${error instanceof Error ? error.message : "unknown error"}\n`,
  )
  process.exitCode = 1
} finally {
  if (paths.length)
    await admin.storage.from("creativeotter-media").remove(paths)
  for (const id of users) await admin.auth.admin.deleteUser(id)
  await sql.end({ timeout: 1 })
  process.stdout.write(
    "Removed disposable users and test media. No provider requests were made.\n",
  )
}
