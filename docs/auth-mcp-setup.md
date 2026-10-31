# Hosted authentication and MCP setup

App: `https://creativeotter-app.vercel.app`

MCP resource: `https://creativeotter-app.vercel.app/api/mcp`

Supabase project: `wgqybqrvxdxaozspzwwx`

## 1. Deploy the app

Set these Vercel environment variables from your existing project configuration, then deploy/redeploy:

- `NEXT_PUBLIC_APP_URL=https://creativeotter-app.vercel.app`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The runtime user-facing auth/MCP routes use RLS-scoped user clients and do not require a service-role key. Keep `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_DB_URL` available only to trusted maintenance or future server-only jobs. Never make them `NEXT_PUBLIC_*`.

MCP and OAuth discovery must be reachable without Vercel Authentication, a deployment password, or an interactive firewall challenge. Supabase OAuth handles user authentication; do not disable application authentication to work around deployment protection.

## 2. Set Supabase Auth URLs

In the project dashboard, **Authentication → URL Configuration**:

- Site URL: `https://creativeotter-app.vercel.app`
- Redirect allowlist: `https://creativeotter-app.vercel.app/auth/callback`
- For local development also allow `http://localhost:3000/**` to preserve callback query parameters.

The app builds callback query parameters itself and validates the local `next` path. If you customize email templates, retain the confirmation URL/PKCE callback flow. Enable email signup and email confirmation; configure your own SMTP for real users instead of relying on the development mail allowance.

## 3. Enable OAuth server

In **Authentication → OAuth Server**, enable the OAuth 2.1 server and set **Authorization Path** to `/oauth/consent`. The hosted consent URL will be `https://creativeotter-app.vercel.app/oauth/consent`.

For automatic client setup in Codex and Claude, enable Dynamic Client Registration. Every newly registered client still needs the user's direct consent and an app-level workspace grant; registration alone provides no data access. Alternatively, pre-register public OAuth clients with the exact callback addresses shown by each host and configure those client IDs in the host. Do not invent callback addresses or use another publisher's registered app identity.

This project already exposes an ES256 public signing key. Use asymmetric JWT signing; the MCP server intentionally rejects HS256 and does not share the project's JWT secret.

OAuth issuer: `https://wgqybqrvxdxaozspzwwx.supabase.co/auth/v1`

Authorization-server discovery: `https://wgqybqrvxdxaozspzwwx.supabase.co/.well-known/oauth-authorization-server/auth/v1`

## 4. Enable the access-token hook

The migration defines `public.creativeotter_access_token_hook(jsonb)` and grants only Supabase Auth permission to invoke it. In **Authentication → Hooks**, select this function for the **Custom Access Token** hook:

```text
pg-functions://postgres/public/creativeotter_access_token_hook
```

Run `yarn db:configure` after setting the stable app URL. The private resource row must equal `https://creativeotter-app.vercel.app/api/mcp`.

For an approved client, the hook adds the exact MCP resource to the token audience while retaining `authenticated` for PostgREST. It preserves the other claims. Without an active grant it does not add the MCP audience. A direct web session is not an MCP credential. The consent action records a read-only grant before approving the OAuth request. Test an actual OAuth exchange after enabling this hook; SQL-only tests cannot prove the hosted Auth configuration is active.

## 5. Connect and test

Codex CLI:

```sh
codex mcp add creativeotter --url https://creativeotter-app.vercel.app/api/mcp
codex mcp login creativeotter
```

Claude Code:

```sh
claude mcp add --transport http creativeotter https://creativeotter-app.vercel.app/api/mcp
```

Then use `/mcp` in Claude Code to inspect/authenticate the server. In Claude chat, add a custom connector with the same MCP URL and complete its OAuth flow. Codex desktop can use MCP/plugin settings. Client UI and account policy can vary.

For the skills repository, from its root:

```sh
npm run build -- --mcp-url https://creativeotter-app.vercel.app/api/mcp
```

Use the generated `dist/connected/codex` or `dist/connected/claude` package. Do not globally install/reconfigure clients without the user's request. All 21 skills may be present, but only the two advertised read-only tools are available in this milestone.

Acceptance checks:

1. Unauthenticated `/api/mcp` returns `401` and a `WWW-Authenticate` challenge naming public metadata.
2. Both assistants can discover OAuth, sign in, display the consent screen and obtain tokens.
3. `get_capabilities` and `manage_account` return the same authorized workspace in both clients.
4. A wrong issuer/audience, a direct web token, a revoked grant or a removed membership cannot read that workspace.
5. Disconnect an app from the dashboard and verify its already-issued token immediately loses workspace access.

No generation or credit charge should occur during these checks.

## Implementation notes

- `email`, `openid` and `profile` are OIDC identity scopes. `offline_access` permits refresh-token connections and is accepted by consent. They do not provide database access; workspace membership and app-level `account:read` grants do that.
- OAuth approval, session refresh and client registration are handled by Supabase Auth. The app does not implement its own authorization-code or refresh-token store.
- MCP cookies are ignored; Bearer access tokens are required. User data is queried with the user's token and RLS, not the admin service role.
- The production app origin is configured explicitly, not derived from a caller's Host header. MCP Origin checks allow the app, ChatGPT and Claude; requests without Origin are accepted only with the normal OAuth checks.
- Revocation first marks the app grant revoked, immediately blocking MCP through RLS, then asks Supabase to revoke the OAuth grant. A provider-side revocation error cannot restore local access.
- The initial migration is immutable after applying it. Any schema or hook change goes in a new migration.

Official references checked during implementation: [Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [Supabase token security](https://supabase.com/docs/guides/auth/oauth-server/token-security), [OpenAI MCP authentication](https://developers.openai.com/plugins/build/auth).

## Verified deployment — 2026-11-01

The production app, callback URL, hosted OAuth server, dynamic registration and access-token hook were configured. Both disposable client protocol fixtures passed DCR, PKCE, resource-bound JWT validation, deployed MCP calls, token refresh and immediate revocation against the same workspace. All fixtures were removed. Real users still complete their own account sign-in and assistant connection.
