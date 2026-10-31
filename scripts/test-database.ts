import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { createDatabaseConnection } from "./database.mjs"
import type { Database } from "../src/lib/database.types"

const main = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const fixtures: string[] = []
  const sql = createDatabaseConnection()
  const resource = `${new URL(process.env.NEXT_PUBLIC_APP_URL!).origin}/api/mcp`
  const clientId = `integration-${randomUUID()}`
  try {
    const makeUser = async () => {
      const email = `creativeotter-test-${randomUUID()}@example.com`
      const password = `${randomUUID()}!Aa`
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      assert.equal(
        created.error,
        null,
        "Unable to create isolated auth fixture",
      )
      const id = created.data.user!.id
      fixtures.push(id)
      const client = createClient<Database>(
        url,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
      const auth = await client.auth.signInWithPassword({ email, password })
      assert.equal(auth.error, null, "Password sign-in failed")
      const workspace = await client.rpc("ensure_personal_workspace")
      assert.equal(workspace.error, null, "Workspace provisioning failed")
      assert.ok(workspace.data)
      const repeated = await client.rpc("ensure_personal_workspace")
      assert.equal(
        repeated.data?.id,
        workspace.data.id,
        "Provisioning must be idempotent",
      )
      return { client, id, workspace: workspace.data }
    }
    const a = await makeUser()
    const b = await makeUser()
    const visible = await a.client.from("workspaces").select("id")
    assert.deepEqual(
      visible.data?.map((w) => w.id),
      [a.workspace.id],
      "User A must not see B's workspace",
    )
    const grant = {
      user_id: a.id,
      client_id: clientId,
      client_name: "Disposable integration fixture",
      redirect_uri: "https://example.com/callback",
      workspace_id: b.workspace.id,
      permissions: ["account:read"],
    }
    assert.ok(
      (await a.client.from("client_grants").insert(grant)).error,
      "Cross-workspace grant must fail",
    )
    assert.equal(
      (
        await a.client
          .from("client_grants")
          .insert({ ...grant, workspace_id: a.workspace.id })
      ).error,
      null,
    )

    const claims = {
      sub: a.id,
      role: "authenticated",
      client_id: clientId,
      aud: ["authenticated", resource],
    }
    const asOAuth = async (audience: string | string[], expected: number) =>
      sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ ...claims, aud: audience })}, true)`
        await tx.unsafe("set local role authenticated")
        const rows = await tx`select id from public.workspaces`
        assert.equal(
          rows.length,
          expected,
          "OAuth RLS must honor resource, membership and current grant",
        )
        if (expected) {
          const context = await tx`select public.get_mcp_context() as context`
          assert.equal(context[0].context.workspace.id, a.workspace.id)
          assert.equal(
            (
              await tx`update public.client_grants set revoked_at = null returning id`
            ).length,
            0,
            "OAuth clients cannot change grants",
          )
          await assert.rejects(
            () =>
              tx.savepoint(
                async (sp) => sp`select public.ensure_personal_workspace()`,
              ),
            { code: "42501" },
          )
        } else {
          await assert.rejects(
            () =>
              tx.savepoint(async (sp) => sp`select public.get_mcp_context()`),
            { code: "42501" },
          )
        }
      })
    await asOAuth(claims.aud, 1)
    await asOAuth(["authenticated", "https://wrong-resource.test/api/mcp"], 0)
    const event = {
      user_id: a.id,
      client_id: clientId,
      claims: { sub: a.id, aud: "authenticated", client_id: clientId },
    }
    const hooked =
      await sql`select public.creativeotter_access_token_hook(${sql.json(event)}) as event`
    assert.deepEqual(
      hooked[0].event.claims.aud,
      ["authenticated", resource],
      "Hook must bind the MCP audience",
    )
    assert.equal(
      (
        await a.client
          .from("client_grants")
          .update({ revoked_at: new Date().toISOString() })
          .eq("client_id", clientId)
      ).error,
      null,
    )
    await asOAuth(claims.aud, 0)
    const revoked =
      await sql`select public.creativeotter_access_token_hook(${sql.json(event)}) as event`
    assert.equal(
      revoked[0].event.claims.aud,
      "authenticated",
      "Revoked clients must not receive the MCP audience",
    )
    process.stdout.write(
      "Passed: real Supabase password sign-in, idempotent workspaces, tenant isolation, grant restrictions, resource binding and immediate revocation.\n",
    )
  } finally {
    await sql.end({ timeout: 1 })
    for (const id of fixtures) {
      const result = await admin.auth.admin.deleteUser(id)
      if (result.error)
        throw new Error("An isolated test user could not be cleaned up")
    }
    process.stdout.write(
      "Disposable auth fixtures removed. No emails were sent.\n",
    )
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    error instanceof assert.AssertionError
      ? `Database test failed: ${error.message}\n`
      : "Database test failed; credentials omitted.\n",
  )
  process.exitCode = 1
})
