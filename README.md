# CreativeOtter app

Next.js 16 and Supabase authentication/MCP foundation. Uses **Supabase Auth**, per-user Row Level Security and explicit client grants. No Clerk or client-side JWT-decoding authorization.

## Implemented

- Email/password signup and sign-in, email-confirmation callback, sign-out and password recovery.
- Server-verified sessions and idempotent personal workspaces.
- OAuth consent UI at `/oauth/consent`; grant revocation from `/dashboard`.
- Stateless Streamable HTTP MCP at `/api/mcp` with `get_capabilities` and `manage_account`.
- Protected-resource discovery at `/.well-known/oauth-protected-resource`, also available at the RFC resource-path location.
- Signature, issuer, expiry, OAuth client and exact MCP audience validation; current membership/grant checks for every MCP request.
- Forward-only migrations, a resource-binding access-token hook and RLS policies that block cross-workspace access and OAuth grant administration.

Media generation, uploads, billing and paid approvals are not enabled. `manage_account` reports billing as unavailable instead of inventing a zero balance.

## Local setup

Use Node 22.22.1 or later and Yarn. Copy `.env.example` to `.env` and supply the project's actual values. Keep the service-role key and database URL server-only. The database helper encodes special characters in the database password and redacts command output.

```sh
yarn install --frozen-lockfile
yarn db:dry-run
yarn db:push
yarn db:configure
yarn dev
```

The hosted app URL is `https://creativeotter-app.vercel.app`. For a local-only run, set `NEXT_PUBLIC_APP_URL=http://localhost:3000` in your local environment. The app origin and database resource configuration must match before OAuth tokens can be used; keep production configured to the hosted URL. A local private endpoint cannot be reached by Claude's cloud connector.

Do not run `supabase config push` blindly: the generated local development config is not a production settings manifest. Migrations apply with the supplied database URL; the CLI account does not need project-management access for that operation.

## Required hosted Supabase configuration

See [the exact setup checklist](docs/auth-mcp-setup.md). Creating SQL functions does not enable Auth hooks or the OAuth server. Those are separate hosted Auth settings. Until they are enabled, the MCP endpoint fails closed and assistant account linking cannot complete.

## Verification

```sh
yarn tsc
yarn lint
yarn test
yarn build
yarn test:database
yarn test:oauth
```

The database integration test creates two disposable confirmed test users, sends no emails, checks real password sign-in, workspace isolation, grant restrictions, hook output and immediate revocation, and removes those users and their workspaces afterward. Run against the configured development project only. It does not replace a live OAuth connection test through each assistant.

Follow `AGENTS.md`, `CLAUDE.md` and `.cursor/rules/`: arrow functions, one component per file, thin routes composing `sections/`, alias imports, repository Prettier formatting and immutable applied migrations.

The hosted OAuth test registers two disposable public client fixtures, exchanges PKCE codes, checks authenticated calls on the deployed MCP service, refreshes tokens and verifies immediate grant revocation. It removes its clients and test user. It does not install plugins or sign in to a real Codex/Claude account.
