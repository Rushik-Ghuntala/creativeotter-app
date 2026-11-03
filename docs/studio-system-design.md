# CreativeOtter Studio system design

Version 0.8.0 — 4 November 2026. Next.js 16 App Router, React 19, Supabase Auth/Postgres/private Storage. No Clerk.

## Access and persistence

The authenticated web session selects a workspace using a validated HttpOnly cookie. Membership is rechecked on every request. RLS applies to every new table; read and write helpers check active membership, role and existing MCP media grants. Direct workspace administration is separate from assistant access. Server actions authenticate independently and validate all input with Zod. The service-role key remains server-only and is not used for ordinary web CRUD.

Tables: `brand_kits`, `studio_characters`, `studio_projects`, `studio_voice_presets`, `studio_shots`, `studio_project_assets`, `workspace_preferences`, `workspace_invites`, `support_requests`. Composite foreign keys prevent cross-workspace media/project/shot links. Archiving creative records is reversible. Film shots are ordered uniquely per film. User-defined support/deletion requests are stored for manual operator handling; submission does not pretend that deletion or an external notification already happened.

Team invitations store only a SHA-256 hash of a cryptographically random token, expire after seven days, and can be revoked. Acceptance locks the invitation, requires a matching confirmed email and a direct session, and inserts creator/viewer membership once. It cannot promote an existing member, transfer ownership or grant administrator. No email is sent automatically.

## Credits and media

The existing integer-unit wallet, quote/claim, private-save and exactly-once settlement functions are unchanged. Image prices remain versioned database records. The library uses user-scoped signed previews/downloads, search, favorites and paginated queries. Only the explicitly selected saved generation IDs enter the branded multi-image gallery.

Project cost attribution references saved assets. Each asset has at most one project assignment in a workspace. The original charged amount is summed; assignment never writes the credit ledger or charges again. Planning budget targets are clearly labeled and are not enforced generation limits.

## Assistant tools

Existing image and account MCP tools remain. Studio adds `manage_themes`, `manage_characters`, `manage_projects`, `manage_voice_presets`, `manage_storyboards`, `assign_project_asset`. Current tool schemas take owned asset IDs rather than arbitrary external URLs. They plan and save records; none invokes inference. Local code must be deployed before the production connector exposes these additions. Local MCP OAuth requires a separately configured resource audience/client setup; this release does not repoint the existing production issuer.

## Explicitly disabled services

Per the owner instruction, paid media and payments remain disabled. Provider execution requires both an operator-set `CREATIVEOTTER_PAID_SERVICES_ENABLED=true` and `FAL_KEY`, plus the existing server budget/pricing checks. No payment credentials, fake checkout, provider voice catalog or generated sample tracks are supplied. Video/audio/cloning/rendering adapters are not implemented. Film, voice and music pages provide honest saved planning workflows. Voice auditions use browser speech synthesis only, labeled as unsaved browser previews.

## Local development

Run `NEXT_PUBLIC_APP_URL=http://localhost:3001 yarn dev --port 3001` because port 3000 belongs to another app. The configured Supabase project is shared; migrations are additive and applied files must never be edited. `yarn db:dry-run` then `yarn db:push` uses the existing redacting wrapper. Paid operations remain blocked. No production deployment is performed as part of this local build.

## Account retention

Invitations and support requests retain their existing restrictive foreign keys. Production deletion therefore requires an explicit operator retention decision and record handling first. An automatic review rejected a proposed cascading-deletion migration; it was never applied and the unapplied draft was removed. Test cleanup deletes only exact disposable fixture invitations/support rows before removing its fixture users.
