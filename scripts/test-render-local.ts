import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createCreativeOtterMcp } from "../src/lib/mcp/server"
import { createDatabaseConnection } from "./database.mjs"
import { runOneRender } from "../src/lib/render/worker"
import { renderInputSchema, RENDER_BUCKET } from "../src/lib/render/contracts"
import { getRender, readRenderPreview } from "../src/lib/render/service"
import { designExample } from "../src/lib/render/example"
import { creditSummarySchema } from "../src/lib/credits/contracts"
import { createServerClient } from "@supabase/ssr"
import type { Database, McpContext } from "../src/lib/database.types"
const main = async () => {
  process.env.CREATIVEOTTER_RENDERING_ENABLED = "true"
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const admin = createClient<Database>(
    base,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const sql = createDatabaseConnection()
  const users: string[] = [],
    clients: string[] = [],
    objects: string[] = []
  const keep = process.argv.includes("--keep")
  let stage = "setup",
    success = false
  const resource = `${new URL(process.env.NEXT_PUBLIC_APP_URL!).origin}/api/mcp`
  const fixture = async (credits: number) => {
    const email = `render-test-${randomUUID()}@example.com`,
      password = `Aa!${randomUUID()}`
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    assert.equal(created.error, null)
    const id = created.data.user!.id
    users.push(id)
    const client = createClient<Database>(base, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    assert.equal(
      (await client.auth.signInWithPassword({ email, password })).error,
      null,
    )
    const workspace = await client.rpc("ensure_personal_workspace")
    assert.equal(workspace.error, null)
    const ws = workspace.data!.id
    await sql`insert into private.workspace_render_settings(workspace_id,enabled,png_credit_units,mp4_credit_units,pricing_version,valid_until) values(${ws},true,16000,16000,'local-test-only-16-v1',now()+interval '1 day')`
    await sql`insert into private.workspace_generation_limits(workspace_id,enabled,daily_budget_micro_usd) values(${ws},true,0) on conflict(workspace_id) do update set enabled=true,daily_budget_micro_usd=0`
    if (credits)
      assert.equal(
        (
          await admin.rpc("record_credit_grant", {
            target_workspace: ws,
            units: String(credits * 1000),
            external_event_id: `render-test:${randomUUID()}`,
            reason: "Disposable local rendering test credits",
          })
        ).error,
        null,
      )
    return { id, email, password, ws, client }
  }
  try {
    const a = await fixture(100),
      b = await fixture(0)
    assert.equal((await admin.rpc("render_worker_heartbeat")).error, null)
    stage = "test-only OAuth client"
    const discovery = await (
      await fetch(`${base}/.well-known/oauth-authorization-server/auth/v1`)
    ).json()
    const redirect = "http://127.0.0.1:43873/callback"
    const registered = await fetch(discovery.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Disposable local render test",
        client_type: "public",
        redirect_uris: [redirect],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    })
    assert.equal(registered.status, 201)
    const oauth = await registered.json()
    clients.push(oauth.client_id)
    const verifier = randomBytes(32).toString("base64url")
    const authorization = new URL(discovery.authorization_endpoint)
    authorization.search = new URLSearchParams({
      client_id: oauth.client_id,
      redirect_uri: redirect,
      response_type: "code",
      scope: "email",
      state: randomUUID(),
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource,
    }).toString()
    const redirectResponse = await fetch(authorization, { redirect: "manual" })
    const authorizationId = new URL(
      redirectResponse.headers.get("location")!,
    ).searchParams.get("authorization_id")!
    assert.equal(
      (
        await a.client.from("client_grants").insert({
          user_id: a.id,
          workspace_id: a.ws,
          client_id: oauth.client_id,
          client_name: "Disposable local render test",
          redirect_uri: redirect,
          permissions: ["account:read", "media:read", "media:prepare"],
        })
      ).error,
      null,
    )
    assert.ok(authorizationId, "OAuth request must reach the consent page")
    assert.equal(
      (await a.client.auth.oauth.getAuthorizationDetails(authorizationId))
        .error,
      null,
    )
    const approved = await a.client.auth.oauth.approveAuthorization(
      authorizationId,
      { skipBrowserRedirect: true },
    )
    assert.equal(approved.error, null)
    const code = new URL(approved.data!.redirect_url).searchParams.get("code")!
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
    const token = (await exchanged.json()).access_token
    const mcpClient = createClient<Database>(base, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const context = await mcpClient.rpc("get_mcp_context")
    assert.equal(context.error, null)
    const server = createCreativeOtterMcp(
      context.data as McpContext,
      process.env.NEXT_PUBLIC_APP_URL!,
      a.email,
      mcpClient,
      token,
    )
    const host = new Client({
      name: "CreativeOtter local renderer test",
      version: "1.0.0",
    })
    const [left, right] = InMemoryTransport.createLinkedPair()
    await server.connect(left)
    await host.connect(right)
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await host.callTool({ name, arguments: args })
      assert.notEqual(
        result.isError,
        true,
        `Tool ${name}: ${JSON.stringify(result.content)}`,
      )
      return result
    }
    const summary = async () =>
      creditSummarySchema.parse(
        (await a.client.rpc("get_credit_summary", { target_workspace: a.ws }))
          .data,
      )
    const output = "output/render-tests"
    await mkdir(output, { recursive: true })
    const results: {
      id: string
      title: string
      format: string
      token: string
      sha256: string | null
    }[] = []
    for (const [format, prompt] of [
      [
        "png",
        "Make a simple Instagram poster for my bakery: Fresh mornings start here.",
      ],
      [
        "mp4",
        "Make a short animated announcement: Our summer collection is here.",
      ],
    ] as const) {
      stage = `${format}: quote from everyday-user brief`
      process.stdout.write(`Testing: ${prompt}\n`)
      const input = renderInputSchema.parse({
        title:
          format === "png"
            ? "Fresh mornings start here."
            : "Our summer collection is here.",
        format,
        ...designExample(
          format === "png"
            ? "Fresh mornings start here."
            : "Our summer collection is here.",
        ),
        width: 640,
        height: 800,
        duration_seconds: 2,
        fps: 12,
      })
      const before = await summary()
      const quoted = await call("prepare_render", {
        ...input,
        request_key: randomUUID(),
      })
      const id = (quoted.structuredContent as { render_id: string }).render_id
      assert.equal((await summary()).available_units, before.available_units)
      const started = await call("render_design", { render_id: id })
      const access = started._meta!["creativeotter/render-access"] as {
        token: string
      }
      assert.equal((await summary()).reserved_units, "16000")
      await call("render_design", { render_id: id })
      assert.equal((await summary()).reserved_units, "16000")
      assert.equal(
        (await b.client.from("render_jobs").select("id").eq("id", id)).data
          ?.length,
        0,
      )
      assert.ok(
        (await b.client.rpc("start_render", { target_render: id })).error,
      )
      stage = `${format}: real local rendering and private save`
      const finished = await runOneRender()
      assert.equal(finished?.id, id)
      assert.equal(finished?.state, "succeeded")
      objects.push(finished!.storage_path!)
      const snapshot = await getRender(mcpClient, a.ws, id)
      assert.equal(snapshot.saved, true)
      assert.equal(snapshot.credit_status, "charged")
      assert.equal(snapshot.credit_units, "16000")
      assert.equal((await summary()).reserved_units, "0")
      assert.equal(
        BigInt(before.available_units) -
          BigInt((await summary()).available_units),
        BigInt(16000),
      )
      const preview = await readRenderPreview(access.token, id)
      const downloaded = await fetch(preview.download_url!)
      assert.equal(downloaded.status, 200)
      const bytes = Buffer.from(await downloaded.arrayBuffer())
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        finished!.sha256,
      )
      await writeFile(`${output}/bakery-${format}.${format}`, bytes)
      const opened = await call("get_render", { render_id: id })
      assert.equal(
        (opened.structuredContent as { state: string }).state,
        "succeeded",
      )
      const repeat = await admin.rpc("complete_render", {
        target_render: id,
        lease: finished!.lease_id!,
        bytes: bytes.length,
        digest: finished!.sha256!,
      })
      assert.equal(repeat.error, null)
      const ledger = await admin
        .from("credit_ledger")
        .select("kind")
        .eq("render_job_id", id)
      assert.deepEqual(ledger.data?.map((item) => item.kind).sort(), [
        "charge",
        "reserve",
      ])
      assert.equal(
        (await summary()).available_units,
        (BigInt(before.available_units) - BigInt(16000)).toString(),
      )
      const publicFile = await fetch(
        `${base}/storage/v1/object/public/${RENDER_BUCKET}/${finished!.storage_path}`,
      )
      assert.notEqual(publicFile.status, 200)
      results.push({
        id,
        title: input.title,
        format,
        token: access.token,
        sha256: finished!.sha256,
      })
      process.stdout.write(
        `Passed ${format}: 16 credits once; private save, preview refresh and byte-matched download.\n`,
      )
    }
    stage = "revocation and cross-design preview protection"
    await assert.rejects(() =>
      readRenderPreview(results[0].token, results[1].id),
    )
    const lost =
      results[0].token.slice(0, -1) +
      (results[0].token.endsWith("a") ? "b" : "a")
    await assert.rejects(() => readRenderPreview(lost, results[0].id))
    assert.equal(
      (
        await a.client
          .from("client_grants")
          .update({ revoked_at: new Date().toISOString() })
          .eq("client_id", oauth.client_id)
      ).error,
      null,
    )
    await assert.rejects(() =>
      readRenderPreview(results[0].token, results[0].id),
    )
    stage = "insufficient funds"
    const input = renderInputSchema.parse({
      title: "Not enough credits",
      format: "png",
      html: "<h1>Hello</h1>",
      width: 640,
      height: 800,
    })
    const noFunds = await b.client.rpc("prepare_render", {
      target_workspace: b.ws,
      render_input: input,
      request_key: randomUUID(),
    })
    assert.equal(noFunds.error, null)
    assert.ok(
      (await b.client.rpc("start_render", { target_render: noFunds.data!.id }))
        .error,
    )
    stage = "confirmed failure returns reservation"
    // A hostile direct RPC cannot bypass worker validation; no failed output is charged.
    const invalid = {
      ...input,
      html: "<script>fetch('http://localhost/secret')</script>",
    }
    const bad = await a.client.rpc("prepare_render", {
      target_workspace: a.ws,
      render_input: invalid,
      request_key: randomUUID(),
    })
    assert.equal(bad.error, null)
    assert.equal(
      (await a.client.rpc("start_render", { target_render: bad.data!.id }))
        .error,
      null,
    )
    assert.equal((await runOneRender())?.state, "failed")
    assert.equal((await summary()).available_units, "68000")
    assert.equal((await summary()).reserved_units, "0")
    assert.equal((await summary()).spent_units, "32000")
    await host.close()
    await server.close()
    await writeFile(
      `${output}/report.json`,
      JSON.stringify(
        {
          success: true,
          customer_account_untouched: true,
          fal_calls: 0,
          before_credits: 100,
          after_credits: 68,
          reserved_credits: 0,
          outputs: results.map(({ token: _token, ...item }) => item),
        },
        null,
        2,
      ),
    )
    if (keep) {
      const jar = new Map<string, string>()
      const web = createServerClient(base, key, {
        cookies: {
          getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
          setAll: (values) =>
            values.forEach(({ name, value }) => jar.set(name, value)),
        },
      })
      assert.equal(
        (
          await web.auth.signInWithPassword({
            email: a.email,
            password: a.password,
          })
        ).error,
        null,
      )
      await writeFile(
        "/tmp/creativeotter-render-qa.json",
        JSON.stringify({
          user: a.id,
          email: a.email,
          password: a.password,
          workspace: a.ws,
          cookies: Array.from(jar, ([name, value]) => ({ name, value })),
          objects,
          users,
          clients,
          results: results.map(({ token: _token, ...item }) => item),
        }),
        { mode: 0o600 },
      )
    }
    success = true
    process.stdout.write(
      "Passed tenant isolation, revoked preview denial, insufficient funds, duplicate completion and failure refund. No fal.ai calls or real customer credits.\n",
    )
  } catch (error) {
    process.stderr.write(
      `Local render test failed at ${stage}: ${error instanceof Error ? error.message : "Unknown error"}\n`,
    )
    process.exitCode = 1
  } finally {
    if (!keep || !success) {
      if (objects.length)
        await admin.storage.from(RENDER_BUCKET).remove(objects)
      for (const clientId of clients)
        await admin.auth.admin.oauth.deleteClient(clientId)
      for (const id of users) await admin.auth.admin.deleteUser(id)
    }
    await sql.end({ timeout: 1 })
  }
}
void main().catch(() => {
  process.stderr.write("Render command failed\n")
  process.exitCode = 1
})
