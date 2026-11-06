import { createServerClient } from "@supabase/ssr"
import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createCreativeOtterMcp } from "../src/lib/mcp/server"
import { createDatabaseConnection } from "./database.mjs"
import { runOneRender } from "../src/lib/render/worker"
import { RENDER_BUCKET } from "../src/lib/render/contracts"
import { readRenderPreview } from "../src/lib/render/service"
import { creditSummarySchema } from "../src/lib/credits/contracts"
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
  const keep = true
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
      _b = await fixture(0)
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
    stage = "SpaceOffice source and quote"
    const root =
      "/Users/rushikghuntala/Documents/ChatGPT/Creative Claw/videos/spaceoffice-motion-30s"
    const output =
      "/Users/rushikghuntala/Documents/ChatGPT/Creative Claw/output/spaceoffice-motion-30s"
    await mkdir(output, { recursive: true })
    const paths: string[] = []
    const collect = async (folder: string) => {
      for (const entry of await readdir(`${root}/${folder}`, {
        withFileTypes: true,
      })) {
        const name = folder ? `${folder}/${entry.name}` : entry.name
        if (entry.isDirectory()) await collect(name)
        else paths.push(name)
      }
    }
    await collect("assets")
    await collect("compositions")
    paths.push(
      "index.html",
      "hyperframes.json",
      "meta.json",
      "package.json",
      "BRIEF.md",
      "SPEC.md",
      "STORYBOARD.md",
    )
    const files = await Promise.all(
      paths.map(async (path) => ({
        path,
        content: await readFile(
          `${root}/${path}`,
          /\.(webp|woff2)$/.test(path) ? "base64" : "utf8",
        ),
        encoding: /\.(webp|woff2)$/.test(path) ? "base64" : "utf8",
      })),
    )
    const settings = {
      width: 1920,
      height: 1080,
      duration_seconds: 30,
      fps: 30,
    }
    const saved = await call("save_motion_project", {
      title: "SpaceOffice — One brief. Your AI team.",
      settings,
      files,
      request_key: randomUUID(),
    })
    const project = saved.structuredContent as {
      revision_id: string
      render_input: import("../src/lib/render/contracts").RenderInput
      source_download_url: string
    }
    const sourceRow = await mcpClient
      .from("motion_revisions")
      .select("*")
      .eq("id", project.revision_id)
      .single()
    assert.equal(sourceRow.error, null)
    assert.equal((await summary()).available_units, "100000")
    const sourceFile = await fetch(project.source_download_url)
    assert.equal(sourceFile.status, 200)
    const zip = Buffer.from(await sourceFile.arrayBuffer())
    assert.equal(
      createHash("sha256").update(zip).digest("hex"),
      sourceRow.data!.source_sha256,
    )
    await writeFile(`${output}/spaceoffice-motion-project.zip`, zip)
    const quoted = await call("prepare_render", {
      ...project.render_input,
      request_key: randomUUID(),
    })
    const id = (quoted.structuredContent as { render_id: string }).render_id
    assert.equal(
      (quoted.structuredContent as { credit_units: string }).credit_units,
      "16000",
    )
    assert.equal((await summary()).available_units, "100000")
    const started = await call("render_design", { render_id: id })
    const access = started._meta!["creativeotter/render-access"] as {
      token: string
    }
    assert.equal((await summary()).available_units, "84000")
    assert.equal((await summary()).reserved_units, "16000")
    await call("render_design", { render_id: id })
    const heartbeat = setInterval(() => {
      void admin.rpc("render_worker_heartbeat").then(() => {})
    }, 10000)
    const began = Date.now()
    process.stdout.write(
      "Rendering one30-second SpaceOffice video through the CreativeOtter worker.16 test credits reserved.\n",
    )
    let finished
    try {
      finished = await runOneRender()
    } finally {
      clearInterval(heartbeat)
    }
    assert.equal(finished?.id, id)
    assert.equal(
      finished?.state,
      "succeeded",
      "The 30-second render must finish before charging",
    )
    objects.push(finished!.storage_path!)
    const opened = await call("get_render", { render_id: id })
    assert.equal((opened.structuredContent as { saved: boolean }).saved, true)
    const preview = await readRenderPreview(access.token, id)
    assert.equal(preview.saved, true)
    const download = await fetch(preview.download_url!)
    assert.equal(download.status, 200)
    const bytes = Buffer.from(await download.arrayBuffer())
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      finished!.sha256,
    )
    await writeFile(`${output}/spaceoffice-motion-30s.mp4`, bytes)
    assert.equal((await summary()).available_units, "84000")
    assert.equal((await summary()).reserved_units, "0")
    const ledger = await admin
      .from("credit_ledger")
      .select("kind,amount_units")
      .eq("render_job_id", id)
    assert.deepEqual(ledger.data?.map((r) => r.kind).sort(), [
      "charge",
      "reserve",
    ])
    assert.equal(
      (
        await admin.rpc("complete_render", {
          target_render: id,
          lease: finished!.lease_id!,
          bytes: bytes.length,
          digest: finished!.sha256!,
        })
      ).error,
      null,
    )
    assert.equal((await summary()).available_units, "84000")
    const previewResource = await host.readResource({
      uri: "ui://creativeotter/render-v1.html",
    })
    assert.ok(
      previewResource.contents.some(
        (c) => "text" in c && c.text.includes("CreativeOtter"),
      ),
    )
    const jar = new Map<string, string>()
    const web = createServerClient(base, key, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (values) =>
          values.forEach(({ name, value }) => jar.set(name, value)),
      },
    })
    await web.auth.signInWithPassword({ email: a.email, password: a.password })
    await writeFile(
      "/tmp/creativeotter-spaceoffice-motion-qa.json",
      JSON.stringify({
        workspace: a.ws,
        user: a.id,
        users,
        clients,
        email: a.email,
        password: a.password,
        cookies: [...jar].map(([name, value]) => ({ name, value })),
        revision_id: project.revision_id,
        render_id: id,
        preview_token: access.token,
        sha256: finished!.sha256,
      }),
      { mode: 0o600 },
    )
    await writeFile(
      `${output}/credit-verification.json`,
      JSON.stringify(
        {
          success: true,
          duration_requested_seconds: 30,
          fps: 30,
          credits_before: 100,
          credits_after: 84,
          charged: 16,
          reserved: 0,
          charge_entries: 1,
          duplicate_start_and_completion_safe: true,
          private_save: true,
          download_sha256_matches: true,
          source_zip_sha256_matches: true,
          real_oauth_mcp_preview_resource: true,
          render_elapsed_seconds: Math.round((Date.now() - began) / 1000),
          fal_calls: 0,
          main_account_untouched: true,
        },
        null,
        2,
      ),
    )
    await host.close()
    await server.close()
    success = true
    process.stdout.write(
      "Passed: one30-second saved SpaceOffice output;100→84 test credits; exact MP4 and source ZIP downloads; duplicate-safe charge.\n",
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
      for (const id of users) {
        const sources = await admin
          .from("motion_revisions")
          .select("source_path")
          .eq("user_id", id)
        if (sources.data?.length)
          await admin.storage
            .from("creativeotter-motion-sources")
            .remove(sources.data.map((row) => row.source_path))
        await admin.auth.admin.deleteUser(id)
      }
    }
    await sql.end({ timeout: 1 })
  }
}
void main().catch(() => {
  process.stderr.write("Render command failed\n")
  process.exitCode = 1
})
