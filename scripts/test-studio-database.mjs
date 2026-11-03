import assert from "node:assert/strict"
import { randomUUID, randomBytes, createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { createDatabaseConnection } from "./database.mjs"
import {
  listStudioRecords,
  saveStudioRecord,
  getStudioRecord,
  saveStoryboardShot,
  assignProjectAsset,
  getProjectDetails,
} from "../src/lib/studio/service.ts"
import { createCreativeOtterMcp } from "../src/lib/mcp/server.ts"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

const main = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const sql = createDatabaseConnection(),
    users = [],
    storagePaths = []
  const makeUser = async () => {
    const email = `studio-${randomUUID()}@example.com`,
      password = `${randomUUID()}!Aa`
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    assert.equal(created.error, null)
    users.push(created.data.user.id)
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    assert.equal(
      (await client.auth.signInWithPassword({ email, password })).error,
      null,
    )
    const workspace = await client.rpc("ensure_personal_workspace")
    assert.equal(workspace.error, null)
    return {
      id: created.data.user.id,
      email,
      client,
      workspace: workspace.data,
    }
  }
  try {
    const a = await makeUser(),
      b = await makeUser(),
      c = await makeUser()
    const canUpload = await a.client.rpc("get_generation_access", {
      target_workspace: a.workspace.id,
    })
    assert.equal(canUpload.data.enabled, true)
    assert.equal(canUpload.data.provider_budget_enabled, false)
    const startWallet = await a.client.rpc("get_credit_summary", {
      target_workspace: a.workspace.id,
    })
    const brand = await saveStudioRecord(a.client, a.workspace.id, "brands", {
      name: "QA brand",
      colors: ["#173D32", "#F9F8F3"],
      tone: "Calm and clear",
    })
    await saveStudioRecord(a.client, a.workspace.id, "characters", {
      name: "QA Otter",
      identity_type: "fictional",
      appearance: "Friendly otter",
    })
    const film = await saveStudioRecord(a.client, a.workspace.id, "films", {
      name: "QA film",
      kind: "film",
      budget_target_units: "16000",
    })
    await saveStudioRecord(a.client, a.workspace.id, "voices", {
      name: "QA narration",
      script: "Hello from CreativeOtter",
      language: "en-US",
    })
    await saveStudioRecord(a.client, a.workspace.id, "music", {
      name: "QA music",
      kind: "music",
      genre: "Cinematic",
      lyrics: "Instrumental",
    })
    assert.equal(
      (await listStudioRecords(a.client, a.workspace.id, "brands")).length,
      1,
    )
    assert.equal(
      (await listStudioRecords(b.client, a.workspace.id, "brands")).length,
      0,
    )
    await assert.rejects(() =>
      getStudioRecord(b.client, a.workspace.id, "brands", brand.id),
    )
    await assert.rejects(() =>
      saveStudioRecord(b.client, a.workspace.id, "characters", {
        name: "Cross-tenant",
      }),
    )
    const shot = await saveStoryboardShot(a.client, a.workspace.id, {
      project_id: film.id,
      position: 1,
      prompt: "A product reveal",
      duration_seconds: 5,
    })
    await assert.rejects(() =>
      saveStoryboardShot(a.client, a.workspace.id, {
        project_id: film.id,
        position: 1,
        prompt: "Duplicate",
      }),
    )
    await saveStoryboardShot(
      a.client,
      a.workspace.id,
      {
        project_id: film.id,
        position: 1,
        prompt: "Updated shot",
        duration_seconds: 7,
      },
      shot.id,
    )
    assert.equal(
      (await getProjectDetails(a.client, a.workspace.id, film.id)).shots[0]
        .duration_seconds,
      7,
    )
    const assetId = randomUUID()
    const fixturePath = `${a.workspace.id}/references/${assetId}`
    assert.equal(
      (
        await admin.storage
          .from("creativeotter-media")
          .upload(
            fixturePath,
            Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
              "base64",
            ),
            { contentType: "image/png" },
          )
      ).error,
      null,
    )
    storagePaths.push(fixturePath)
    assert.equal(
      (
        await admin.from("media_assets").insert({
          id: assetId,
          workspace_id: a.workspace.id,
          user_id: a.id,
          kind: "reference",
          status: "ready",
          storage_path: `${a.workspace.id}/references/${assetId}`,
          label: "Disposable DB-only reference",
          mime_type: "image/png",
        })
      ).error,
      null,
    )
    assert.equal(
      (
        await b.client.from("studio_characters").insert({
          workspace_id: b.workspace.id,
          name: "Foreign asset",
          reference_asset_id: assetId,
        })
      ).error?.code,
      "23503",
    )
    await assignProjectAsset(a.client, a.workspace.id, film.id, assetId)
    await assert.rejects(() =>
      assignProjectAsset(a.client, a.workspace.id, film.id, assetId),
    )
    const token = randomBytes(32).toString("hex"),
      hash = createHash("sha256").update(token).digest("hex")
    const invite = await a.client.rpc("create_workspace_invite", {
      target_workspace: a.workspace.id,
      invite_email: b.email,
      invite_role: "viewer",
      secret_hash: hash,
    })
    assert.equal(invite.error, null)
    assert.ok(
      (await c.client.rpc("accept_workspace_invite", { secret_hash: hash }))
        .error,
    )
    assert.equal(
      (await b.client.rpc("accept_workspace_invite", { secret_hash: hash }))
        .data,
      a.workspace.id,
    )
    assert.ok(
      (await b.client.rpc("accept_workspace_invite", { secret_hash: hash }))
        .error,
    )
    assert.equal(
      (await listStudioRecords(b.client, a.workspace.id, "characters")).length,
      1,
    )
    await assert.rejects(() =>
      saveStudioRecord(b.client, a.workspace.id, "characters", {
        name: "Viewer cannot create",
      }),
    )
    assert.ok(
      (
        await b.client.rpc("create_workspace_invite", {
          target_workspace: a.workspace.id,
          invite_email: c.email,
          invite_role: "creator",
          secret_hash: createHash("sha256").update("nope").digest("hex"),
        })
      ).error,
    )
    assert.ok(
      (
        await b.client
          .from("workspace_preferences")
          .update({ video_mode: "auto" })
          .eq("workspace_id", a.workspace.id)
          .select()
          .single()
      ).error,
    )
    const members = await a.client.rpc("list_workspace_members", {
      target_workspace: a.workspace.id,
    })
    assert.equal(members.data.length, 2)
    const clientId = `studio-grant-${randomUUID()}`
    const resource = (
      await sql`select resource_uri from private.mcp_configuration where singleton`
    )[0].resource_uri
    await a.client.from("client_grants").insert({
      user_id: a.id,
      client_id: clientId,
      client_name: "Disposable Studio scope fixture",
      redirect_uri: "https://example.com/callback",
      workspace_id: a.workspace.id,
      permissions: ["account:read"],
    })
    const assertScope = async (expectedRead, expectedWrite) =>
      sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: a.id, role: "authenticated", client_id: clientId, aud: ["authenticated", resource] })},true)`
        await tx.unsafe("set local role authenticated")
        const read =
          await tx`select public.can_read_studio(${a.workspace.id}) as allowed`
        assert.equal(read[0].allowed, expectedRead)
        const write =
          await tx`select public.can_edit_studio(${a.workspace.id}) as allowed`
        assert.equal(write[0].allowed, expectedWrite)
        assert.equal(
          (
            await tx`select id from public.brand_kits where workspace_id=${a.workspace.id}`
          ).length,
          expectedRead ? 1 : 0,
        )
        await assert.rejects(
          () =>
            tx.savepoint(
              async (sp) =>
                sp`select public.list_workspace_members(${a.workspace.id})`,
            ),
          { code: "42501" },
        )
      })
    await assertScope(false, false)
    await a.client
      .from("client_grants")
      .update({ permissions: ["account:read", "media:read"] })
      .eq("client_id", clientId)
    await assertScope(true, false)
    await a.client
      .from("client_grants")
      .update({ permissions: ["account:read", "media:read", "media:prepare"] })
      .eq("client_id", clientId)
    await assertScope(true, true)
    const context = {
      user_id: a.id,
      client_id: clientId,
      workspace: { id: a.workspace.id, name: a.workspace.name },
      role: "owner",
      permissions: ["account:read", "media:read", "media:prepare"],
    }
    const server = createCreativeOtterMcp(
        context,
        "http://localhost:3001",
        a.email,
        a.client,
      ),
      [serverSide, clientSide] = InMemoryTransport.createLinkedPair(),
      mcp = new Client({ name: "studio-test", version: "1" })
    await Promise.all([server.connect(serverSide), mcp.connect(clientSide)])
    try {
      const tools = await mcp.listTools()
      assert.ok(tools.tools.find((t) => t.name === "manage_characters"))
      assert.ok(tools.tools.find((t) => t.name === "show_image_gallery"))
      const list = await mcp.callTool({
        name: "manage_characters",
        arguments: { action: "list" },
      })
      assert.equal(list.isError, undefined)
      assert.equal(list.structuredContent.records.length, 1)
      const get = await mcp.callTool({
        name: "manage_projects",
        arguments: { action: "get", section: "films", id: film.id },
      })
      assert.equal(get.structuredContent.details.shots.length, 1)
      const invalid = await mcp.callTool({
        name: "manage_characters",
        arguments: {
          action: "save",
          data: { name: "Foreign", reference_asset_id: randomUUID() },
        },
      })
      assert.equal(invalid.isError, true)
    } finally {
      await mcp.close()
      await server.close()
    }
    const support = await a.client
      .from("support_requests")
      .insert({
        workspace_id: a.workspace.id,
        user_id: a.id,
        category: "support",
        message: "Disposable integration test request",
      })
      .select("id")
      .single()
    assert.equal(support.error, null)
    assert.equal(
      (
        await b.client
          .from("support_requests")
          .select("id")
          .eq("id", support.data.id)
      ).data.length,
      0,
    )
    assert.ok(
      (
        await b.client.from("support_requests").insert({
          workspace_id: a.workspace.id,
          user_id: a.id,
          category: "support",
          message: "Impersonation must fail",
        })
      ).error,
    )
    const endWallet = await a.client.rpc("get_credit_summary", {
      target_workspace: a.workspace.id,
    })
    assert.deepEqual(endWallet.data, startWallet.data)
    process.stdout.write(
      "PASS: Studio CRUD, film ordering, cross-workspace isolation, linked-asset foreign keys, one-project assignment, verified-email invite acceptance/replay, viewer restrictions, MCP scope boundaries, real MCP tools and unchanged credits. No inference, checkout, real-account credits or messages.\n",
    )
  } finally {
    if (storagePaths.length)
      await admin.storage.from("creativeotter-media").remove(storagePaths)
    // Remove only this run's disposable invitations before deleting its fixture accounts.
    if (users.length) {
      assert.equal(
        (await admin.from("workspace_invites").delete().in("created_by", users))
          .error,
        null,
      )
      assert.equal(
        (await admin.from("support_requests").delete().in("user_id", users))
          .error,
        null,
      )
    }
    for (const id of users) {
      const cleanup = await admin.auth.admin.deleteUser(id)
      assert.equal(cleanup.error, null, "Fixture cleanup failed")
    }
    await sql.end({ timeout: 1 })
  }
}
main().catch((error) => {
  process.stderr.write(`${error.name}: ${error.message}\n`)
  process.exitCode = 1
})
