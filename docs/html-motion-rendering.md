# Current motion upgrade

See [HyperFrames motion](hyperframes-motion.md) for the new 0.10.0 implementation, project ZIPs, revisions, 30fps and bundled audio/video. The CSS-only limitations below describe the earlier renderer and remain relevant only to the legacy CSS route. Production rendering is still gated.

# HTML and motion rendering

Implemented in backend 0.9.0, locally validated on 2026-11-06. This engine does not call fal.ai or any generative-media API. Browser/CPU hosting and private Storage still consume infrastructure resources.

## Supported output

- PNG: self-contained HTML/CSS at animation time zero.
- MP4: silent CSS-keyframe motion, 1–10 seconds, 12 or 24 fps, H.264/yuv420p.
- Even width/height from 128–1920 pixels; maximum output 30 MiB.
- Up to four ready images from the same workspace via `asset_ids` and `<img src="asset:UUID">`.
- System fonts, SVG shapes, gradients, typography and CSS layouts. Put CSS in the separate `css` field.

Scripts, GSAP/HyperFrames JavaScript, external URLs, inline style attributes/tags, external fonts, audio tracks and filmed/AI-generated video are outside this first renderer. Unsupported input is rejected rather than run. This is a CSS-motion renderer, not a full arbitrary-code HyperFrames runtime.

## Run locally

Existing Supabase environment values remain server-only. The local app and worker use the configured Supabase project; Docker/local Supabase was unavailable during this test. Test accounts/workspaces are disposable and real customer wallets are never used.

```sh
yarn install --frozen-lockfile
yarn playwright install chromium
# Install FFmpeg on the worker host if absent; macOS: brew install ffmpeg.
# Terminal 1
CREATIVEOTTER_RENDERING_ENABLED=true yarn worker:render
# Terminal 2; port 3001 keeps the existing local app available
CREATIVEOTTER_RENDERING_ENABLED=true CREATIVEOTTER_LOCAL_DIST_DIR=.next-render yarn dev --port 3001
```

Visit `/studio/designs`. Generation additionally needs an explicitly enabled `private.workspace_render_settings` row with non-null prices, a version and validity deadline. The migrations create **no** workspace price, grant credits, or enable rendering for any customer. The feature flag is not added to `.env` or Vercel automatically. A live worker heartbeat is required for new quotes/starts.

## Credits and lifecycle

One shared credit wallet; 1000 units = 1 credit. `prepare_render` binds exact input, output tier and a versioned retail price without spending. `render_design`/`start_render` atomically reserves that quote once on an explicit request, without another approval. The worker claims one job, validates and renders in a separate process, uploads the existing bytes privately, then `complete_render` charges the reservation transactionally. Duplicate starts/completions do not repeat rendering or charging. Confirmed failure returns the reserved credits. A Storage/finalization outage retains the reservation for recovery; an expired lease can reuse the existing private artifact. Worker claims recheck current membership, preparation grants and the workspace enablement.

Local fixtures use the user-approved temporary 16 credits per PNG and 16 credits per short MP4. These are test prices, not a configured production motion-price policy. Request keys identify one intent; reuse after a transport error, use a fresh key for an explicitly requested new design.

## Preview, saving and downloads

The Studio and MCP widget share `RenderPanel`. PNG previews and MP4 playback show the CreativeOtter brand, saved state and authoritative credit state. Finished outputs appear in Designs & motion; image-source library records remain separate from rendered designs. Links renew before their one-hour expiry and on foreground/online events. An image load error also requests a fresh authorized link. Download refreshes access before using the host download API, external-link fallback or normal web download. Opening, refreshing or downloading never starts generation or spends credits.

MCP uses a random opaque read credential scoped to one render, stored only as a hash in the DB and placed in tool-private metadata. Its cached widget storage contains no OAuth token, source markup or media bytes. Each read/sign request rechecks the live client grant/version, membership and user state. Connection changes/revocation invalidate it; it cannot generate, upload, reserve or spend. CORS permits only the app and supported assistant widget origins. Files stay in the private `creativeotter-renders` bucket; no authenticated uploads or public reads are allowed.

## Worker boundaries

Chromium runs with its sandbox enabled in a fresh process/context per job. Source scripts and service workers are disabled. Markup is allowlisted, CSS external resource constructs are rejected, CSP denies network/scripts, and all browser network requests are aborted. Only verified owned image bytes are embedded. The render subprocess receives no Supabase/fal/API credentials; it has bounded input/output and a 150-second process-group deadline. Temporary frames are cleaned; FFmpeg receives fixed arguments without a shell. Concurrency defaults to one job per worker. Queues are durable in Postgres, not in-memory Vercel callbacks.

For production, provision a dedicated non-root worker host/container with Chromium sandbox support, FFmpeg, memory/CPU/process/disk limits and restricted filesystem/egress. Never expose Chromium/CDP publicly or use `--no-sandbox`/privileged mode to make untrusted content run. The current local test proves macOS execution; Linux container isolation/operations must be validated on the selected hosting platform before enabling customer rendering. [Playwright's container guidance](https://playwright.dev/docs/docker) explains the non-root sandbox requirements. Vercel serves the app/MCP/status routes, not the heavy render loop. Provisioning/deployment is a separate step; no paid render hosting was created here.

## Reproduce validation

```sh
# Stop other render workers to prevent them racing the isolated test runner.
yarn test:render:local --keep
# Start the local app on 3001 if needed. Saved-output checks do not render again.
yarn test:render:web
# Optional: test one new Studio image at the configured disposable price
yarn test:render:web --create
node --env-file=.env --conditions=react-server --import tsx scripts/test-render-permissions.ts
node --env-file=.env --import tsx scripts/test-render-preview.ts
yarn test:render:cleanup
yarn test:render:controls # mocked UI state recovery; no account or generation
yarn test:render:balance # one disposable live Studio render; sidebar wallet refresh
yarn tsc
yarn lint
yarn test
yarn build
```

`--keep` writes a mode-0600 temporary fixture file under `/tmp`, never the repository. Clean it after browser checks. `output/render-tests/` holds ignored proof PNG/MP4, browser screenshots, downloaded bytes and reports. The scripts exercise real hosted Auth/OAuth/RLS/Storage with local Chromium/FFmpeg. Everyday bakery/launch briefs are test inputs; these are deterministic MCP/schema/UI checks, not a claim that a live Claude conversation was tested against an undeployed feature. The immutable upstream skill snapshot stays untouched.
