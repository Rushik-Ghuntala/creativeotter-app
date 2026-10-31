# Hybrid media: native first

The assistant inspects its actual host tools. A suitable native tool wins, including when the provider backend is unavailable. Respect an explicitly requested model. An ambiguous native outcome must be checked before another generation; a safety refusal must not be routed around.

A skill cannot make a remote MCP server invoke the assistant’s internal image generator. The host executes its native tool; CreativeOtter can then save the exact resulting image. Native usage still follows the host plan and limits. Do not report a provider model name unless the tool actually reports it.

## Private native image preview

Apply the forward migrations with `yarn db:push`. Enable one workspace with:

```sh
node --env-file=.env scripts/enable-native-preview.mjs <workspace-uuid>
```

This enables native imports with a **zero provider budget**. Existing OAuth grants are unchanged. The user separately clicks **Enable media preparation** for the intended connected application in `/dashboard`, or opts into media access during OAuth consent. That grants `media:read` and `media:prepare`; it does not permit MCP to approve paid jobs.

Native image workflow:

1. Use the matching host-native tool and preserve its returned file. Saving can fail independently; do not regenerate merely to retry an upload.
2. `create_native_output` binds the exact prompt, host, reported model (nullable), reference IDs and a stable UUID request key. It returns a signed private PUT URL.
3. Transfer the existing image bytes with the declared MIME type, then call `complete_native_output`. A validated private output must exist before success.
4. The MCP App shows Output/Inputs, references, download and favorite. `get_native_generation` renews short-lived private links. `/studio/library` exposes the same workspace library.

The first release imports PNG/JPEG/WebP images up to 12 MB and 8192 pixels per side. Host/model provenance is client-reported, not cryptographic attestation. Imports are bounded to 100 per workspace/day. Signed upload URLs are bearer credentials; do not log them. Saved asset URLs expire after an hour and must not be made public.

## Optional provider fallback

The only provider adapter is Nano Banana 2: one PNG, 1K, supported aspect ratios, and up to 14 private ready image references. It is not required for native creation.

To enable paid fallback later, supply server-only `FAL_KEY`, verify/refresh the private pricing row against the provider’s current terms, and deliberately set a positive `private.workspace_generation_limits.daily_budget_micro_usd`. Never set a `NEXT_PUBLIC_` provider secret. The pricing row expires after seven days; expired pricing fails closed. The workspace budget is a provider cost cap, not a retail credit balance.

`estimate_generation` binds inputs and a maximum provider estimate to an expiring quote. `generate_image` opens the review panel. Only a direct authenticated browser approval can reserve budget and create its unique job. MCP tokens cannot approve. A lease prevents duplicate dispatch. A timeout or missing acceptance receipt enters `needs_reconciliation` and is never automatically resubmitted. Retry saving an accepted output using its existing receipt.

The private preview reconciles accepted jobs when their status is opened or refreshed; there is no background scheduler or webhook yet. Closing the panel can delay copying a completed provider result into private storage until the next status check. Production rollout needs independent reconciliation, provider failure/refund review and pricing maintenance. No retail billing, credit checkout, video/audio provider adapters, voice cloning or production rendering are implemented.

## Verification

`yarn test` exercises auth/protocol, routing choices, refusal/uncertain-result handling, provider receipt origin/path validation, single-attempt submission and real image validation. `yarn test:media:database` uses disposable isolated users and static image bytes; it validates storage/RLS, zero provider jobs for native imports, exact request binding, idempotency and direct-browser-only paid approval. It never calls a media provider and removes its fixtures.

A real host-native generation and authenticated MCP import are separate end-to-end checks. A fixture upload is not evidence of AI generation. Claude package validation is not evidence of a live Claude OAuth or native tool test.
