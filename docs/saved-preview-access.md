# Persistent saved-image previews

Saved-gallery UI v8 refreshes all output/reference links before their one-hour Storage expiry, on returning to a visible/online window, on image load recovery, and before Download. Selection and the historical credit total stay unchanged. Temporary errors retry with a one-minute backoff; revoked access stops polling.

A completed result gets a separate 256-bit `sp1` read capability in tool-result `_meta`, never model-visible content or a URL. Only its SHA256 is stored in the private, RLS-enabled `saved_preview_grants` table. It has no OAuth access token and no clock expiry. It is revoked by changing/revoking its owning connection grant or removing that record/membership/account permission. A grant-version trigger prevents accidentally reviving an old capability when permissions are removed and later restored.

Each issuance checks the original authenticated MCP workspace permissions and limits scope to 1–20 **already saved** generations. Output/reference asset IDs are pinned at issuance so later additions cannot widen the scope. Every refresh and Storage signing operation rechecks the live grant version, account, membership, media-read permission and enabled workspace. The read RPC strips native execution tokens, provider request/receipt URLs and leases. It never reconciles, dispatches, quotes, uploads, reserves or charges.

Storage uses a public-key client with `x-creativeotter-preview` checked by a SELECT-only RLS policy. No service-role client or write policy is introduced. Without the valid capability, anonymous Storage access and private record listings remain denied. Credentials remain in request headers/body to our own HTTPS status endpoint and Supabase's scoped read RPC, not query strings, logs or public files. Existing encrypted 15-minute credentials remain supported and upgrade after an authorized read of a completed result. Pending generation keeps its original OAuth checks.

The user explicitly approved persistent per-gallery access after being informed of the tradeoff: if a capability leaks, it can read only its pinned images/references until the connection is revoked or changed. Already-issued Storage signed URLs retain their normal lifetime (up to one hour); revocation prevents subsequent reads/signing, rather than cancelling previously issued URLs. Existing pre-v8 iframes need the updated widget code once; subsequent expiry recovery is automatic.

## Operator verification (existing images only)

- `node --env-file=.env scripts/test-saved-preview-database.mjs --review-migration` reviews the pending migration and authorization tests in a rolled-back transaction. After applying, omit `--review-migration`.
- `yarn test`, `yarn build`, `yarn lint` cover contracts, expired OAuth independence, origin/body validation, scoped HTTP transport, private-link scheduling and revocation behavior.
- Start the production build on port3108 and run `node --env-file=.env scripts/test-saved-preview-http.mjs`. Set `PREVIEW_TEST_ORIGIN` for the deployed origin. It backdates only a disposable read grant by eight hours, reads three existing results, verifies all download hashes and revokes the disposable capability. It never generates or uploads media and never calls billing.
- Compare wallet, reserved credits, provider/native counts, quotes and charge counts before/after. Reopen the saved set through Claude to load v8, then test gallery navigation, automatic/manual refresh, suspend/restore and Download.

The operator scripts select the existing CreativeOtter test workspace and saved image IDs explicitly; review those constants before using another environment. They do not create fixture users or images. Read grants created solely for HTTP verification are deleted afterwards; database denial tests roll back all temporary changes.
