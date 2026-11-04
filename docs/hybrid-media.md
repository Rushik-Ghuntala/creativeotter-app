# Paid hybrid media

Prefer an actually available, suitable host-native engine to reduce operating cost. **Both native and API generation spend CreativeOtter credits.** A missing provider key does not imply free customer generation. Planning, account reads and reference uploads are separate from generating a new output.

## Native image execution

1. Inspect actual host tools, finalize exact inputs and upload needed references.
2. `prepare_native_generation` creates a bound, expiring native credit quote using enabled `native:image` workspace pricing. No zero-price fallback exists.
3. For an explicit generation request, continue immediately to `claim_native_generation`. No separate browser approval is needed. An estimate-only request stops at the quote without spending credits.
4. `claim_native_generation` atomically reserves sufficient credits and claims execution once. Only `claimed: true` authorizes one native tool call with its fixed inputs. Save the execution token privately. Lost/duplicate claims need reconciliation rather than another generation.
5. `create_native_output` authorizes a private upload only with the claimed generation ID and execution token. Upload the existing PNG/JPEG/WebP bytes (12 MB, 8192-pixel limit), then `complete_native_output` validates/saves them and settles the reserved credits once.
6. Failure/uncertainty reported by the client keeps credits reserved. A trusted operator confirms failure before release. Cancellation in the authenticated page releases a reservation only before execution is claimed. Saving can be retried using the same output/token.

The native generator runs in the host, not inside the MCP server. The backend can enforce its priced workflow, claim, storage delivery and credit ledger; it cannot prevent independent host-tool use outside CreativeOtter or attest the actual host/model. The skill must follow the billing sequence. A product needing server-authoritative inference and model attestation should use its provider-backed adapter instead. Do not market the skill as a global host-tool paywall.

Old completed test records retain `legacy_no_charge` status. They are historical records, not a current free tier. The old free import/complete RPC signatures are revoked. Applied migrations remain immutable.

## Activation

`node --env-file=.env scripts/enable-native-preview.mjs <workspace-uuid>` enables the workspace while keeping its provider budget zero. Media access still requires explicit user consent, already granted for the existing Codex connection. It does not waive credit pricing or balance checks.

After the owner chooses a product price, configure the same standard-image price for native and API routes with:

```sh
node --env-file=.env scripts/configure-image-prices.mjs <workspace-uuid> <positive-display-credit-amount>
```

This configures versioned retail pricing only. It never grants credits, configures a provider key or increases the provider budget. Prices expire after 30 days and quotes after at most 15 minutes. Existing quotes preserve their bound price. Paid checkout is not implemented; legitimate issuance remains service-only and idempotent.

## API fallback

Only one fal.ai Nano Banana 2 image adapter is implemented (one PNG, 1K, up to 14 references). It additionally needs an explicit operator-set `CREATIVEOTTER_PAID_SERVICES_ENABLED=true`, server-only `FAL_KEY`, verified provider pricing and a positive provider micro-USD workspace budget. Never expose provider keys to the client. `estimate_generation` binds the retail credits and maximum provider estimate; `generate_image` starts a unique job and reserves credits directly for the requested image. Unknown submissions are not retried automatically. A saved result settles once; confirmed failure releases once.

Provider reconciliation occurs on status reads; no background scheduler/webhook is implemented. Video/audio/editing billing adapters, checkout/subscriptions/chargebacks/credit expiry and refunds after completed charges remain outside this release. Unsupported native media routes must not be executed for free through CreativeOtter.

## Verification

Run `yarn test`, `yarn test:media:database`, `yarn test:credits:database`, and `yarn test:native:database`. The database tests provision isolated disposable users/prices and static image bytes, clean them up and never call a native generator or media provider. Native billing tests cover old-route denial, no unapproved uploads, sufficient funds, direct execution on user request, quote binding, concurrent reservations, one-use claims, paid delivery, retry settlement, cancellation, uncertain-result holds and trusted failure release.

## fal setup and deployment

The server uses its existing HTTP queue adapter in `src/lib/media/provider.ts`; no SDK or fal MCP installation is needed. It calls `fal-ai/nano-banana-2` for text prompts and `fal-ai/nano-banana-2/edit` for reference images. The model schemas were checked on 5 November 2026 at the endpoint's `/llms.txt` URL. Requests use one 1K PNG, minimal thinking and no web/image search. fal currently documents $0.08 per standard image; this provider cost is separate from the owner-approved customer price of 16 CreativeOtter credits for both native and API images. Recheck provider pricing before renewing the private pricing record.

Store `FAL_KEY` only in the ignored root `.env` for local use. The fal agent-connect flow described in https://fal.ai/get-started.md can save it after the owner approves in their browser. Keep the file untracked, ignored, not symlinked and permission 600. Never overwrite a configured key or print it. An already-created separate manual key can be used for deployment; another key is unnecessary.

For Claude's hosted MCP, configure server-only `FAL_KEY` and `CREATIVEOTTER_PAID_SERVICES_ENABLED=true` in the Vercel project's Production environment and redeploy. Local configuration alone does not change that endpoint. Keep the local paid-services flag false until workspace activation is intended. The existing workspace provider budget is independent of fal account funds and customer credits; an operator must explicitly configure a positive daily limit. Neither saving a key nor deploying grants credits or changes that budget.

The existing `generate_image` MCP tool opens CreativeOtter's progress/output widget; the backend saves the result privately and settles the bound customer credits once. Account/gallery rendering has been tested in Claude, but a fresh API result, exact 16-credit settlement and actual download must still be tested together after deployment and funded activation. Status polling performs reconciliation; there is no background scheduler.

A present key is not proof of successful authentication or funding. Setup and mocked tests do not submit paid inference. Model requests require fal funds at https://fal.ai/dashboard/usage-billing/credits.

## Embedded preview refresh

The v7 widget first tries the host-qualified status tool, then the authenticated MCP status resource. Claude Code can reject both iframe callbacks. With explicit owner approval, the widget therefore also receives a 15-minute encrypted delegation under tool-result `_meta`, limited to the exact displayed generation IDs. The original OAuth access token stays inside an A256GCM-encrypted envelope. The purpose-specific encryption key is derived server-side from the existing service-role secret; no server/provider key is delivered to the browser.

`POST /api/preview/status` accepts only a scoped image reference and that encrypted bearer. It decrypts and checks expiry, revalidates the original OAuth issuer/audience/signature, reloads the current MCP context, and uses the original per-user Supabase client and RLS. Missing/revoked grants, changed workspace, another image, unsupported parameters and unrecognized browser origins fail closed. Responses are no-store, the token is sent in an Authorization header with cookies omitted, and the CSP permits status connections only to the app origin. The endpoint cannot quote, generate, reserve credits, change settings or dispatch queued jobs. It can reconcile an already-submitted request and refresh its existing private links.

The saved preview performs one read-only refresh on opening and continues status polling only while the existing job is pending. Expired delegated access requires reopening the existing image through the assistant. Older widget URIs remain aliases, but an iframe already open before deployment can retain its old bundle.

Regression coverage includes host IPC failures, qualified tool names, text-only results, resource and HTTP fallback, encrypted/tampered credentials, exact-image scoping, revoked grants, OAuth/context checks, cross-origin restrictions and queued-job non-dispatch. Live verification must reuse the saved image and show unchanged job/charge counts and wallet balance.
