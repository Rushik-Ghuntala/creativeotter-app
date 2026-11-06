import assert from "node:assert/strict"
import { randomUUID, randomBytes, createHash } from "node:crypto"
import { writeFile, readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { createDatabaseConnection } from "./database.mjs"
const base = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createClient(base, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const sql = createDatabaseConnection()
const fixturePath = "/tmp/creativeotter-native-motion-fixture.json"
const main = async () => {
  if (process.argv[2] === "inspect") {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8"))
    const wallet = await admin.rpc("get_credit_summary", {
      target_workspace: fixture.workspace_id,
    })
    const jobs = await admin
      .from("render_jobs")
      .select("id,state,title:input,credit_units,sha256,storage_path")
      .eq("workspace_id", fixture.workspace_id)
      .order("created_at")
    const ledger =
      await sql`select kind, amount_units from public.credit_ledger where workspace_id=${fixture.workspace_id}`
    console.log(
      JSON.stringify({ wallet: wallet.data, jobs: jobs.data, ledger }, null, 2),
    )
    return
  }
  if (process.argv[2] !== "init")
    throw new Error(
      "Use init to create a disposable fixture, or inspect for a read-only wallet check",
    )
  const email = `render-plugin-test-${randomUUID()}@example.com`
  const password = `Aa!${randomUUID()}`
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  assert.equal(created.error, null)
  const user = createClient(base, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  assert.equal(
    (await user.auth.signInWithPassword({ email, password })).error,
    null,
  )
  const workspace = await user.rpc("ensure_personal_workspace")
  assert.equal(workspace.error, null)
  const ws = workspace.data.id
  const fixture = {
    user_id: created.data.user.id,
    email,
    workspace_id: ws,
    client_ids: [],
  }
  await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 })
  await sql`insert into private.workspace_render_settings(workspace_id,enabled,png_credit_units,mp4_credit_units,pricing_version,valid_until) values(${ws},true,16000,16000,'native-host-test-only-16-v1',now()+interval '1 day')`
  await sql`insert into private.workspace_generation_limits(workspace_id,enabled,daily_budget_micro_usd) values(${ws},true,0) on conflict(workspace_id) do update set enabled=true,daily_budget_micro_usd=0`
  assert.equal(
    (
      await admin.rpc("record_credit_grant", {
        target_workspace: ws,
        units: "100000",
        external_event_id: `native-host-test:${randomUUID()}`,
        reason: "Disposable native Codex and Claude motion testing",
      })
    ).error,
    null,
  )
  const discovery = await (
    await fetch(`${base}/.well-known/oauth-authorization-server/auth/v1`)
  ).json()
  const resource = `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp`
  for (const host of ["codex", "claude"]) {
    const redirect = "http://127.0.0.1:43873/callback"
    const response = await fetch(discovery.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: `CreativeOtter Dev ${host}`,
        client_type: "public",
        redirect_uris: [redirect],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    })
    assert.equal(response.status, 201)
    const oauth = await response.json()
    fixture.client_ids.push(oauth.client_id)
    await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 })
    const verifier = randomBytes(32).toString("base64url")
    const authorization = new URL(discovery.authorization_endpoint)
    authorization.search = new URLSearchParams({
      client_id: oauth.client_id,
      redirect_uri: redirect,
      response_type: "code",
      scope: "email offline_access",
      state: randomUUID(),
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource,
    }).toString()
    const redirected = await fetch(authorization, { redirect: "manual" })
    const authorizationId = new URL(
      redirected.headers.get("location"),
    ).searchParams.get("authorization_id")
    assert.ok(authorizationId)
    assert.equal(
      (
        await user.from("client_grants").insert({
          user_id: fixture.user_id,
          workspace_id: ws,
          client_id: oauth.client_id,
          client_name: `CreativeOtter Dev ${host}`,
          redirect_uri: redirect,
          permissions: ["account:read", "media:read", "media:prepare"],
        })
      ).error,
      null,
    )
    assert.equal(
      (await user.auth.oauth.getAuthorizationDetails(authorizationId)).error,
      null,
    )
    const approved = await user.auth.oauth.approveAuthorization(
      authorizationId,
      { skipBrowserRedirect: true },
    )
    assert.equal(approved.error, null)
    const code = new URL(approved.data.redirect_url).searchParams.get("code")
    const exchanged = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: oauth.client_id,
        redirect_uri: redirect,
        code,
        code_verifier: verifier,
        resource,
      }),
    })
    assert.equal(exchanged.status, 200)
    const tokens = await exchanged.json()
    await writeFile(
      `/tmp/creativeotter-motion-${host}.json`,
      JSON.stringify({
        mcp_url: "http://localhost:3001/api/mcp",
        client_id: oauth.client_id,
        token_endpoint: discovery.token_endpoint,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Date.now() + tokens.expires_in * 1000,
      }),
      { mode: 0o600 },
    )
    console.log(
      `${host}: isolated OAuth connection ready; refresh token ${Boolean(tokens.refresh_token)}`,
    )
  }
  console.log(
    "Disposable test wallet ready: 100 credits. Provider budget zero. Production account unchanged.",
  )
}
try {
  await main()
} finally {
  await sql.end({ timeout: 1 })
}
