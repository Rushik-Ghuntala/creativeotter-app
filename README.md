## Full local Studio (0.8.0)

Run `NEXT_PUBLIC_APP_URL=http://localhost:3001 yarn dev --port 3001` and open [CreativeOtter locally](http://localhost:3001/studio). Port 3000 is used by another app on this workstation. Sign in using the existing Supabase account; there is no Clerk.

The local app includes Account (credits, billing ledger/CSV, searchable library, team invitations and settings), Studio home, Characters, Films/storyboards, voice presets/browser auditions, music briefs, project asset/cost attribution, brand kits, a private asset viewer and connection guides. Data is persisted in Supabase under workspace RLS; creation/planning forms do not spend credits. See [system design](docs/studio-system-design.md).

Paid services stay disabled by default. `CREATIVEOTTER_PAID_SERVICES_ENABLED=true` **and** `FAL_KEY`, verified pricing and a positive operator budget are required for the existing image API adapter. Video/audio/cloning/rendering adapters and checkout/subscriptions are not implemented; their pages provide saved planning workflows and clearly explain this. Native assistant image generation keeps its existing quote/claim/save/settle billing flow. The production MCP endpoint is unchanged; new local tool additions require deployment before they are available there.

Validation: `yarn test`, `yarn tsc`, `yarn lint`, `yarn build`, `yarn test:studio:database`. Database tests use disposable fixture users with explicit cleanup, do not generate media, and do not change a real account balance. The browser QA helper `scripts/studio-local-qa.mjs` writes its temporary credentials only to a private file in `/tmp`; run its `cleanup` command when finished.

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

- Native-first routing instructions with private image import, validated reference uploads and a shared image library.
- Image Output/Inputs MCP App and web viewer, signed downloads, favorites, exact prompts and references.
- Optional fal.ai Nano Banana 2 fallback with immutable quotes, direct execution on user request, a workspace budget, idempotent submission and uncertain-outcome reconciliation.

Native creation uses an actual tool exposed by the host assistant and does not require our provider key. Import is an explicitly enabled private preview. Provider inference stays unavailable until server credentials and a positive workspace budget are configured. Transactional credit accounting is implemented with actual workspace balances, immutable ledger history and reserve/charge/release handling. New native and API images both spend CreativeOtter credits. Native-first reduces operating cost, not customer pricing. Native work requires a priced quote, a balance check and a single paid execution claim before the host generator runs. Credit purchases are not enabled; no trial credits are silently issued. Retail pricing and sufficient wallet funds are required for both routes. Missing native pricing or funds fails closed. Only the image backend workflow is implemented. See [hybrid media setup](docs/hybrid-media.md).

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
yarn test:media:database
yarn test:credits:database
yarn test:native:database
```

The database integration test creates two disposable confirmed test users, sends no emails, checks real password sign-in, workspace isolation, grant restrictions, hook output and immediate revocation, and removes those users and their workspaces afterward. Run against the configured development project only. It does not replace a live OAuth connection test through each assistant.

Follow `AGENTS.md`, `CLAUDE.md` and `.cursor/rules/`: arrow functions, one component per file, thin routes composing `sections/`, alias imports, repository Prettier formatting and immutable applied migrations.

The hosted OAuth test registers two disposable public client fixtures, exchanges PKCE codes, checks authenticated calls on the deployed MCP service, refreshes tokens and verifies immediate grant revocation. It removes its clients and test user. It does not install plugins or sign in to a real Codex/Claude account.

See [credit accounting](docs/credit-accounting.md) for pricing configuration, trusted issuance, settlement, operational limits and test coverage.

Saved carousels and multi-image results use the read-only `show_image_gallery` MCP App tool. It presents ordered thumbnails with per-image Output/Inputs, favorites and downloads through the CreativeOtter viewer; reopening results never generates or charges credits.

Older chat tool catalogs may need a connection refresh to discover new MCP tools. The server retains earlier image-widget resource URIs. When embedded discovery is stale, `/studio/gallery` provides the same branded controls for an explicitly ordered `items=source:generation_id,...` selection; it uses the signed-in user's RLS permissions and never groups unrelated private images automatically.

## Plugin test downloads

Ready-to-use plugin ZIPs and installation instructions are in [plugins/creativeotter](plugins/creativeotter/README.md). Rebuild them from the separate skills repository with `yarn package:plugins /absolute/path/to/creativeotter-skills`.
