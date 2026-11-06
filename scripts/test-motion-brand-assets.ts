import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { createCreativeOtterMcp } from "../src/lib/mcp/server"
import { createDatabaseConnection } from "./database.mjs"
import { beginMediaUpload, finishMediaUpload } from "../src/lib/media/assets"
import { creditSummarySchema } from "../src/lib/credits/contracts"
import { MEDIA_BUCKET } from "../src/lib/media/contracts"
import { readMotionSource } from "../src/lib/render/project-service"
import { readProjectZip, MOTION_SOURCE_BUCKET } from "../src/lib/render/project"
import {
  RENDER_BUCKET,
  type RenderInput,
  type RenderSnapshot,
} from "../src/lib/render/contracts"
import { bundleMotionAssets } from "../src/lib/render/project-assets"
import { packProject } from "../src/lib/render/project"
import { runOneRender } from "../src/lib/render/worker"
import type { Database, McpContext } from "../src/lib/database.types"

type BrandFixture = {
  name: string
  prompt: string
  colors: string[]
  settings: {
    width: number
    height: number
    duration_seconds: number
    fps: number
  }
  source: string
  assets: {
    filename: string
    role: "logo" | "character" | "product"
    name: string
  }[]
  extra_files?: { path: string; file: string }[]
}

const main = async () => {
  const directory = process.argv[2]
  const output = process.argv[3]
  if (!directory || !output)
    throw new Error(
      "Pass a local artwork directory, output directory and optional brand fixture JSON",
    )
  const fixture: BrandFixture = process.argv[4]
    ? JSON.parse(await readFile(process.argv[4], "utf8"))
    : {
        name: "SpaceOffice",
        prompt: "Make a quick video for spaceoffice.ai.",
        colors: ["#143c32", "#f8f4ec", "#31c8c4"],
        settings: { width: 1280, height: 720, duration_seconds: 6, fps: 30 },
        source: "tests/fixtures/motion-brand-launch.html",
        assets: [
          { filename: "logo.png", role: "logo", name: "Logo" },
          ...["Hydrogen", "Copper", "Silicon"].map((name) => ({
            filename: `${name.toLowerCase()}.webp`,
            role: "character" as const,
            name,
          })),
        ],
      }
  const prefix = fixture.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")
  process.env.CREATIVEOTTER_RENDERING_ENABLED = "true"
  const sql = createDatabaseConnection()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const admin = createClient<Database>(
    url,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  let client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const mediaPaths: string[] = []
  const sourcePaths: string[] = []
  const renderPaths: string[] = []
  let oauthId: string | undefined
  let userId: string | undefined
  let host: Client | undefined
  let server: ReturnType<typeof createCreativeOtterMcp> | undefined
  try {
    const password = `Aa!${randomUUID()}`
    const email = `motion-artwork-test-${randomUUID()}@example.com`
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
    const ws = (await client.rpc("ensure_personal_workspace")).data!.id
    await sql`insert into private.workspace_render_settings(workspace_id,enabled,mp4_credit_units,pricing_version,valid_until) values(${ws},true,16000,'artwork-test-only',now()+interval '1 hour')`
    await sql`insert into private.workspace_generation_limits(workspace_id,enabled,daily_budget_micro_usd) values(${ws},true,0) on conflict(workspace_id) do update set enabled=true,daily_budget_micro_usd=0`
    assert.equal(
      (
        await admin.rpc("record_credit_grant", {
          target_workspace: ws,
          units: "100000",
          external_event_id: `artwork-test:${randomUUID()}`,
          reason: "Disposable motion artwork regression",
        })
      ).error,
      null,
    )
    const wallet = async () => {
      const result = await client.rpc("get_credit_summary", {
        target_workspace: ws,
      })
      assert.equal(result.error, null)
      return creditSummarySchema.parse(result.data)
    }
    const art = []
    for (const item of fixture.assets) {
      const { filename } = item
      const bytes = await readFile(path.join(directory, filename))
      const mime = /\.jpe?g$/i.test(filename)
        ? "image/jpeg"
        : filename.endsWith(".png")
          ? "image/png"
          : "image/webp"
      const upload = await beginMediaUpload(
        client,
        ws,
        `${fixture.name} ${item.name}`,
        mime,
      )
      mediaPaths.push(upload.path)
      assert.equal(
        (
          await client.storage
            .from(MEDIA_BUCKET)
            .uploadToSignedUrl(upload.path, upload.token, bytes, {
              contentType: mime,
            })
        ).error,
        null,
      )
      await finishMediaUpload(client, ws, upload.asset_id)
      art.push({
        asset_id: upload.asset_id,
        path: `assets/${filename}`,
        bytes,
        role: item.role,
        name: item.name,
      })
    }
    // Exercise the same current-client grant checks used by real assistant previews.
    const discovery = await (
      await fetch(`${url}/.well-known/oauth-authorization-server/auth/v1`)
    ).json()
    const redirect = "http://127.0.0.1:43873/callback"
    const resource = `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp`
    const registered = await fetch(discovery.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Disposable artwork test",
        client_type: "public",
        redirect_uris: [redirect],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    })
    assert.equal(registered.status, 201)
    const oauth = await registered.json()
    oauthId = oauth.client_id
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
    const redirected = await fetch(authorization, { redirect: "manual" })
    const authorizationId = new URL(
      redirected.headers.get("location")!,
    ).searchParams.get("authorization_id")!
    assert.ok(authorizationId)
    assert.equal(
      (
        await client.from("client_grants").insert({
          user_id: userId,
          workspace_id: ws,
          client_id: oauth.client_id,
          client_name: "Disposable artwork test",
          redirect_uri: redirect,
          permissions: ["account:read", "media:read", "media:prepare"],
        })
      ).error,
      null,
    )
    assert.equal(
      (await client.auth.oauth.getAuthorizationDetails(authorizationId)).error,
      null,
    )
    const approved = await client.auth.oauth.approveAuthorization(
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
    client = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const context = await client.rpc("get_mcp_context")
    assert.equal(context.error, null)
    host = new Client({ name: "Everyday branded motion", version: "1" })
    server = createCreativeOtterMcp(
      context.data as McpContext,
      process.env.NEXT_PUBLIC_APP_URL!,
      null,
      client,
      token,
    )
    const [left, right] = InMemoryTransport.createLinkedPair()
    await server.connect(left)
    await host.connect(right)
    const call = async <T>(name: string, args: Record<string, unknown>) => {
      const result = await host!.callTool({ name, arguments: args })
      assert.notEqual(result.isError, true, JSON.stringify(result.content))
      return result.structuredContent as T
    }
    await call("manage_themes", {
      action: "save",
      data: {
        name: fixture.name,
        colors: fixture.colors,
        logo_asset_id: art.find((a) => a.role === "logo")?.asset_id || null,
      },
    })
    for (const asset of art.filter((a) => a.role === "character"))
      await call("manage_characters", {
        action: "save",
        data: {
          name: asset.name,
          identity_type: "fictional",
          reference_asset_id: asset.asset_id,
        },
      })
    const themes = await call<{ records: unknown[] }>("manage_themes", {
      action: "list",
    })
    const characters = await call<{ records: unknown[] }>("manage_characters", {
      action: "list",
    })
    const library = await call<{ assets: { id: string }[] }>("manage_assets", {
      action: "list",
      kind: "reference",
      limit: 50,
    })
    assert.equal(themes.records.length, 1)
    assert.equal(
      characters.records.length,
      art.filter((a) => a.role === "character").length,
    )
    assert.equal(library.assets.length, art.length)
    const files = [
      {
        path: "index.html",
        content: await readFile(fixture.source, "utf8"),
      },
    ]
    for (const file of fixture.extra_files || [])
      files.push({
        path: file.path,
        content: await readFile(file.file, "utf8"),
      })
    const attachments = art.map(({ asset_id, path }) => ({ asset_id, path }))
    await assert.rejects(() =>
      bundleMotionAssets(client, randomUUID(), packProject(files), attachments),
    )
    const args = {
      title: `${fixture.name} — real brand artwork`,
      settings: fixture.settings,
      request_key: randomUUID(),
      files,
      assets: attachments,
    }
    type Saved = {
      revision_id: string
      render_input: RenderInput
      source_download_url: string
    }
    const saved = await call<Saved>("save_motion_project", args)
    sourcePaths.push(`${ws}/${saved.revision_id}.zip`)
    const retry = await call<Saved>("save_motion_project", args)
    assert.equal(retry.revision_id, saved.revision_id)
    const source = await readMotionSource(client, ws, saved.revision_id)
    const bundled = readProjectZip(source.zip)
    for (const asset of art)
      assert.deepEqual(Buffer.from(bundled[asset.path]), asset.bytes)
    assert.equal((await wallet()).available_units, "100000")
    const quote = await call<{ render_id: string }>("prepare_render", {
      ...saved.render_input,
      request_key: randomUUID(),
    })
    renderPaths.push(`${ws}/${quote.render_id}.mp4`)
    // The real worker uses the existing queue; another running local worker may claim this job first.
    await admin.rpc("render_worker_heartbeat")
    await call("render_design", { render_id: quote.render_id })
    await call("render_design", { render_id: quote.render_id })
    await runOneRender()
    let snapshot = await call<RenderSnapshot>("get_render", {
      render_id: quote.render_id,
    })
    for (
      let n = 0;
      snapshot.state !== "succeeded" && snapshot.state !== "failed" && n < 120;
      n++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      snapshot = await call<RenderSnapshot>("get_render", {
        render_id: quote.render_id,
      })
    }
    assert.equal(snapshot.state, "succeeded")
    assert.equal(snapshot.saved, true)
    assert.equal(snapshot.credit_status, "charged")
    const download = await fetch(snapshot.download_url!)
    assert.equal(download.status, 200)
    const mp4 = Buffer.from(await download.arrayBuffer())
    const job = await client
      .from("render_jobs")
      .select("sha256")
      .eq("id", snapshot.render_id)
      .single()
    const sha = createHash("sha256").update(mp4).digest("hex")
    assert.equal(sha, job.data?.sha256)
    const zipDownload = await fetch(saved.source_download_url)
    assert.equal(zipDownload.status, 200)
    assert.deepEqual(
      Buffer.from(await zipDownload.arrayBuffer()),
      Buffer.from(source.zip),
    )
    const revision = await call<Saved>("revise_motion_project", {
      title: args.title,
      settings: args.settings,
      parent_id: saved.revision_id,
      request_key: randomUUID(),
      changes: [
        {
          path: "notes.txt",
          content:
            "Keep the official logo and all three original agent images.",
        },
      ],
    })
    sourcePaths.push(`${ws}/${revision.revision_id}.zip`)
    const revised = readProjectZip(
      (await readMotionSource(client, ws, revision.revision_id)).zip,
    )
    for (const asset of art)
      assert.deepEqual(Buffer.from(revised[asset.path]), asset.bytes)
    const balance = await wallet()
    assert.equal(balance.available_units, "84000")
    assert.equal(balance.reserved_units, "0")
    assert.equal(balance.spent_units, "16000")
    await mkdir(output, { recursive: true })
    await writeFile(path.join(output, `${prefix}-brand-motion.mp4`), mp4)
    await writeFile(
      path.join(output, `${prefix}-brand-project.zip`),
      source.zip,
    )
    const report = {
      prompt: fixture.prompt,
      test_scope:
        "Scripted authenticated MCP workflow with real public artwork; not a live assistant routing evaluation",
      source_discovery: {
        themes: themes.records.length,
        characters: characters.records.length,
        images: art.length,
      },
      settings: fixture.settings,
      exact_assets_bundled: true,
      revisions_preserve_artwork: true,
      duplicate_save_same_revision: true,
      cross_workspace_denied: true,
      credits_before: 100,
      credits_after: 84,
      charged: 16,
      reserved: 0,
      downloads_match: true,
      source_zip_match: true,
      sha256: sha,
      fal_calls: 0,
      production_account_untouched: true,
    }
    await writeFile(
      path.join(output, "verification.json"),
      JSON.stringify(report, null, 2),
    )
    console.log(JSON.stringify(report))
  } finally {
    await host?.close()
    await server?.close()
    for (const [bucket, paths] of [
      [MEDIA_BUCKET, mediaPaths],
      [MOTION_SOURCE_BUCKET, sourcePaths],
      [RENDER_BUCKET, renderPaths],
    ] as const)
      if (paths.length)
        assert.equal(
          (await admin.storage.from(bucket).remove(paths)).error,
          null,
        )
    if (userId)
      assert.equal((await admin.auth.admin.deleteUser(userId)).error, null)
    if (oauthId)
      assert.equal(
        (await admin.auth.admin.oauth.deleteClient(oauthId)).error,
        null,
      )
    await sql.end({ timeout: 1 })
  }
}
void main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
