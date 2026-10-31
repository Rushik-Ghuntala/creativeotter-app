import assert from "node:assert/strict"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

let stage = "setup"
const main = async () => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const resource = `${new URL(process.env.NEXT_PUBLIC_APP_URL).origin}/api/mcp`
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const admin = createClient(base, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  let userId
  const clientIds = []
  try {
    stage = "create disposable user"
    const email = `creativeotter-oauth-${randomUUID()}@example.com`
    const password = `${randomUUID()}!Aa`
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    assert.equal(created.error, null, "Unable to create disposable user")
    userId = created.data.user.id
    const user = createClient(base, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    assert.equal(
      (await user.auth.signInWithPassword({ email, password })).error,
      null,
      "Direct sign-in failed",
    )
    const workspace = await user.rpc("ensure_personal_workspace")
    assert.equal(workspace.error, null, "Workspace creation failed")

    stage = "OAuth discovery"
    const discovery = await fetch(
      `${base}/.well-known/oauth-authorization-server/auth/v1`,
    ).then((r) => r.json())
    assert.ok(discovery.registration_endpoint, "DCR is not enabled")
    const workspaceIds = []
    for (const label of ["Codex protocol fixture", "Claude protocol fixture"]) {
      stage = `${label}: dynamic registration`
      const redirectUri = "http://127.0.0.1:43871/callback"
      const registration = await fetch(discovery.registration_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: `CreativeOtter ${label}`,
          client_type: "public",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      })
      assert.equal(
        registration.status,
        201,
        "Public client registration failed",
      )
      const client = await registration.json()
      clientIds.push(client.client_id)
      const verifier = randomBytes(32).toString("base64url")
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url")
      const state = randomUUID()
      const authorization = new URL(discovery.authorization_endpoint)
      authorization.search = new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "email offline_access",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource,
      }).toString()
      stage = `${label}: authorization redirect`
      const request = await fetch(authorization, { redirect: "manual" })
      assert.ok(
        [302, 303].includes(request.status),
        "Authorization must redirect to our consent page",
      )
      const consent = new URL(request.headers.get("location"))
      assert.equal(
        consent.origin,
        new URL(resource).origin,
        "Consent must use the configured production origin",
      )
      assert.equal(consent.pathname, "/oauth/consent")
      const id = consent.searchParams.get("authorization_id")
      assert.ok(id)
      stage = `${label}: deployed consent preserves the opaque request ID`
      const loginRedirect = await fetch(consent, { redirect: "manual" })
      assert.ok(
        [302, 303, 307].includes(loginRedirect.status),
        "A valid opaque authorization ID must reach login, not the fallback page",
      )
      const login = new URL(loginRedirect.headers.get("location"), consent)
      assert.equal(login.origin, consent.origin)
      assert.equal(login.pathname, "/auth/login")
      assert.equal(
        login.searchParams.get("next"),
        consent.pathname + consent.search,
      )
      stage = `${label}: request details and explicit test grant`
      const details = await user.auth.oauth.getAuthorizationDetails(id)
      assert.equal(details.error, null, "Authorization details failed")
      assert.equal(details.data.client.id, client.client_id)
      const grant = await user.from("client_grants").insert({
        user_id: userId,
        client_id: client.client_id,
        client_name: `CreativeOtter ${label}`,
        redirect_uri: redirectUri,
        workspace_id: workspace.data.id,
        permissions: ["account:read"],
      })
      assert.equal(grant.error, null, "Fixture grant failed")
      const approved = await user.auth.oauth.approveAuthorization(id, {
        skipBrowserRedirect: true,
      })
      assert.equal(approved.error, null, "Test authorization failed")
      const callback = new URL(approved.data.redirect_url)
      assert.equal(callback.searchParams.get("state"), state)
      const code = callback.searchParams.get("code")
      assert.ok(code)

      stage = `${label}: PKCE exchange and hosted token hook`
      const exchanged = await fetch(discovery.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: client.client_id,
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
          resource,
        }),
      })
      assert.equal(
        exchanged.status,
        200,
        "Authorization-code exchange or token hook failed",
      )
      const token = await exchanged.json()
      assert.ok(
        token.access_token && token.refresh_token,
        "Access and refresh tokens are required",
      )
      const call = async (accessToken) => {
        const result = await fetch(resource, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-06-18",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "manage_account",
              arguments: { section: "overview" },
            },
          }),
        })
        return { status: result.status, body: await result.json() }
      }
      stage = `${label}: authenticated deployed MCP`
      const result = await call(token.access_token)
      assert.equal(result.status, 200, "Authenticated MCP request failed")
      assert.equal(
        result.body.result.structuredContent.workspace.id,
        workspace.data.id,
      )
      workspaceIds.push(result.body.result.structuredContent.workspace.id)
      stage = `${label}: refresh token`
      const refreshed = await fetch(discovery.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: client.client_id,
          refresh_token: token.refresh_token,
          resource,
        }),
      })
      assert.equal(refreshed.status, 200, "Token refresh failed")
      const updated = await refreshed.json()
      assert.equal(
        (await call(updated.access_token)).status,
        200,
        "Refreshed token must retain workspace access",
      )
      stage = `${label}: immediate grant revocation`
      assert.equal(
        (
          await user
            .from("client_grants")
            .update({ revoked_at: new Date().toISOString() })
            .eq("client_id", client.client_id)
        ).error,
        null,
      )
      assert.equal(
        (await call(updated.access_token)).status,
        403,
        "Revocation must block an already-issued token",
      )
      await user.auth.oauth.revokeGrant({ clientId: client.client_id })
      process.stdout.write(
        `${label}: DCR, PKCE, hook, deployed MCP, refresh and revocation passed.\n`,
      )
    }
    assert.equal(
      workspaceIds[0],
      workspaceIds[1],
      "Both client flows must use the same workspace",
    )
    process.stdout.write(
      "Both client protocol flows resolve to the same workspace. Actual host installation is a separate user sign-in step.\n",
    )
  } finally {
    let cleanupFailed = false
    for (const clientId of clientIds) {
      const result = await admin.auth.admin.oauth.deleteClient(clientId)
      if (result.error) cleanupFailed = true
    }
    if (userId && (await admin.auth.admin.deleteUser(userId)).error)
      cleanupFailed = true
    if (cleanupFailed)
      throw new Error("Disposable OAuth fixture cleanup needs attention")
    process.stdout.write(
      "Disposable OAuth clients and user removed. No emails or media jobs were submitted.\n",
    )
  }
}

main().catch(() => {
  process.stderr.write(
    `OAuth integration failed at: ${stage}. Credentials and token contents omitted.\n`,
  )
  process.exitCode = 1
})
