# Paid hybrid media

Prefer an actually available, suitable host-native engine to reduce operating cost. **Both native and API generation spend CreativeOtter credits.** A missing provider key does not imply free customer generation. Planning, account reads and reference uploads are separate from generating a new output.

## Native image execution

1. Inspect actual host tools, finalize exact inputs and upload needed references.
2. `prepare_native_generation` creates a bound, expiring native credit quote using enabled `native:image` workspace pricing. No zero-price fallback exists.
3. The user reviews the prompt, references and credit amount at `/studio/native/review/<id>`. Only a direct browser session can approve and atomically reserve sufficient credits.
4. `claim_native_generation` claims the approved execution once. Only `claimed: true` authorizes one native tool call with its fixed inputs. Save the execution token privately. Lost/duplicate claims need reconciliation rather than another generation.
5. `create_native_output` authorizes a private upload only with the approved generation ID and execution token. Upload the existing PNG/JPEG/WebP bytes (12 MB, 8192-pixel limit), then `complete_native_output` validates/saves them and settles the reserved credits once.
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

Only one fal.ai Nano Banana 2 image adapter is implemented (one PNG, 1K, up to 14 references). It additionally needs server-only `FAL_KEY`, verified provider pricing and a positive provider micro-USD workspace budget. Never expose provider keys to the client. `estimate_generation` binds the retail credits and maximum provider estimate; direct browser approval creates a unique job and reserves credits. Unknown submissions are not retried automatically. A saved result settles once; confirmed failure releases once.

Provider reconciliation occurs on status reads; no background scheduler/webhook is implemented. Video/audio/editing billing adapters, checkout/subscriptions/chargebacks/credit expiry and refunds after completed charges remain outside this release. Unsupported native media routes must not be executed for free through CreativeOtter.

## Verification

Run `yarn test`, `yarn test:media:database`, `yarn test:credits:database`, and `yarn test:native:database`. The database tests provision isolated disposable users/prices and static image bytes, clean them up and never call a native generator or media provider. Native billing tests cover old-route denial, no unapproved uploads, sufficient funds, browser-only approval, quote binding, concurrent reservations, one-use claims, paid delivery, retry settlement, cancellation, uncertain-result holds and trusted failure release.
