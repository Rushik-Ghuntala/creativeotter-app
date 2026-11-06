# CreativeOtter motion graphics

Backend 0.10.0 and adapted skills 0.8.0 implement code-authored motion through the official HyperFrames 0.9.19 compiler/runtime, pinned GSAP 3.14.2, sandboxed Chromium and FFmpeg. Codex/Claude author the project with their existing intelligence. There is no fal.ai or separate authoring-model call for this workflow.

## Working flow

`save_motion_project` saves complete authored files. For an existing project ZIP, `prepare_motion_upload` returns a private upload URL; PUT the ZIP, then use `confirm_motion_upload`. ZIP transfers go straight to Supabase Storage, avoiding Vercel's function upload limit.

Pass the saved revision's `render_input` to `prepare_render`. This is a non-spending estimate. An explicit user video request proceeds directly to `render_design`, which reserves the quoted credits once. The worker renders and saves the MP4 privately; only saved delivery settles the charge. Poll `get_render`; its embedded CreativeOtter panel plays the video, renews private URLs and downloads it. Repeated starts/completions cannot charge twice. Canonical source archives retain their digest across retries; an unchanged editor retry reuses its saved revision and the same render idempotency key after an uncertain response. Confirmed render failure returns the reservation; uncertain saving retries the same artifact.

Use `list_motion_projects` and `get_motion_project` to find source. `revise_motion_project` replaces selected text files, preserves bundled assets and creates an immutable version. It rejects stale-parent edits. Prior versions and ZIP bytes are retained. Project save/open/download/revision operations spend no generation credits. A requested new render of a revision is a new priced operation.

Studio at `/studio/designs` offers a headline/accent template, duration control, direct Create video, private ZIP import, source editor, version history, editable ZIP download and saved MP4 previews. Still images continue through the image-generation workflow.

## Composition contract and limits

- Root `index.html` has `data-composition-id`, `data-width`, `data-height`, `data-duration` and a matching paused `window.__timelines[id]` timeline.
- Nested `data-composition-src` HTML and JavaScript/GSAP timelines are compiled by official HyperFrames. The worker uses its `__player.enableRenderMode` / `renderSeek` clock, not a wall-clock screen recording.
- MP4/H.264, even dimensions from 128 to 1920, 1–30 whole seconds, 12/24/25/30 fps. Default 30 fps. Root dimensions/duration must match the quoted revision. Legacy CSS PNG/MP4 contracts remain compatible for existing callers; the adapted motion skill and new editor output MP4 only.
- GSAP URL `https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js` resolves to the installed local pinned file. Bundle all other scripts, styles, fonts, SVGs, images and media. No network/CDN fallback.
- ZIP: up to 25 MB compressed, 64 MB expanded, 256 entries, 512 KB per code file / 2 MB cumulative code. No traversal, absolute paths, hidden files, node_modules, symlinks, duplicate case-insensitive names, executables, ZIP64, multi-disk or encrypted archives. Package metadata may be retained; scripts/install hooks are never executed.
- Supplied H.264 MP4/WebM video, WAV/MP3/M4A/OGG audio, raster images, SVG and bundled fonts are supported. Up to eight timed media elements. Every audio/video needs an id and explicit data-start/data-duration. Use fixed data-media-start, data-playback-rate (0.5–2), data-volume (0–2) and loop; audible video needs data-has-audio=true. Nested scene media starts use HyperFrames' resolved clock. Mixing supports fixed gain, trims, loops, overlap and delays. Audio volume automation, ramps, effects and generated music/voice are not implemented; do not author them as if supported.
- 30 MB MP4 output, bounded browser/encoder deadline; oversized or failed jobs refund their reservation. Resources do not guarantee every 30-second 1920px composition will fit the deadline.

## Private sources and execution

Sources live in the private `creativeotter-motion-sources` bucket. `motion_revisions` and source reads use current workspace media permissions. Sources are immutable, digest-bound to their revision and checked again before rendering. The server never executes uploaded Node/npm code or serves project HTML as an app page. Studio edits source as text.

Each job runs in a fresh child process without Supabase/OAuth/provider secrets, a fresh Chromium process with its sandbox enabled, a clean browser context and a synthetic in-memory HTTPS origin. HTTP resources outside the validated archive and pinned GSAP are blocked, WebSockets/popups/service workers are blocked, and navigation/downloads/permissions are restricted. Compilation file reads stay within the extracted project. CSP blocks forms, frames and network endpoints; JavaScript runs only within the isolated browser. FFmpeg receives fixed validated arguments. MP4 codec, frame count, fps, dimensions and duration are checked before storage and charging. HyperFrames telemetry is disabled in the child environment.

Existing saved-preview credentials cover output status/media only. They do not grant source ZIP access. Authenticated source download links last ten minutes and are refreshed on each request; no source URL is added to the anonymous persistent-preview scope.

This is local application isolation, not proof of hardened multi-tenant production hosting. Before enabling public rendering, run the worker in a dedicated non-root, resource-limited host with Chromium sandbox/user-namespace support and outbound-network restrictions. Web routes can run on Vercel; long browser/FFmpeg jobs must run on the dedicated worker. Roll out the worker before enabling the web discovery flag. Test the actual target worker host before accepting customer jobs.

## Pricing and release state

Migrations `20261106020000_hyperframes_projects.sql` and `20261106030000_motion_input_guards.sql` add source revisions, source policies and revision-bound quotes. Previously applied migrations remain unchanged. It enables no customer workspace and sets no customer price.

Only disposable local fixtures use the approved **16-credit test price**. Production motion pricing stays unset and `CREATIVEOTTER_RENDERING_ENABLED` remains off in production. Existing native/API image pricing is unchanged. Installing a new skills ZIP does not deploy the worker or enable pricing.

## Validation commands

```sh
yarn test
yarn lint
yarn tsc
yarn build
yarn test:motion:engine
yarn test:motion:database
yarn test:motion:oauth
```

For browser QA, run the database test with `--keep`, start the local app with the rendering flag and local dist directory, then run `scripts/test-motion-web.ts` and `scripts/test-motion-create-web.ts` using their documented Node commands. These use disposable users/credits only. Run `yarn test:motion:cleanup` to remove the retained fixture source/output objects and users afterward. Never substitute a real customer's workspace.

QA artifacts are generated under ignored `output/hyperframes-tests/`. The exact downloaded Swiss Grid archive was rendered unchanged at 1920×1080, 10 seconds, 30fps (300 frames). Its original SHA-256 is `cd2a32d8f523e138d9619339584190d6d39c2551072ec56a9e03b9da7543bee8`. Do not redistribute reference archives without retaining upstream attribution. The test project with supplied audio and video passed actual AAC-signal, playback and frame-rate checks. Real Supabase tests proved 100→84 for one render, duplicate-charge prevention, immutable revisions, matching private source/output downloads, workspace isolation and failure refunds. A separate everyday Studio creation test proved another single 16-credit charge, saved-list refresh and Create re-enable.

The schema fixtures include normal prompts such as “Make my bakery headline pop with animated text and moving shapes” and “Change the headline … keep the music … don’t make another video yet.” They validate routing/tool inputs; they are not a claim that production Codex/Claude caches have been refreshed or that a live assistant session has run the new tools.

## Attribution

HyperFrames is Apache-2.0; preserve its license/notice when redistributing. GSAP uses its own standard license, not Apache-2.0. Its official license FAQ permits AI-generated GSAP code; any future visual animation-builder product requires checking the applicable restrictions: https://gsap.com/community/standard-license/ . The preserved copied skill snapshot remains byte-identical.

## Reusing real brand artwork

The motion skill resolves relevant brand kits, saved characters and library references before authoring. For a supplied website, the host inspects actual logos, mascot/agent files and product imagery when its browsing/download tools permit. Available artwork should appear as artwork, not invented initial avatars. Explicitly text-only or abstract briefs stay text-only or abstract.

`save_motion_project` and `revise_motion_project` accept optional `assets: [{asset_id, path}]`. Each path must be an unused PNG/JPEG/WebP name under `assets/`. The authenticated backend reads only ready images from the current workspace and copies byte-verified files into the private source ZIP. Relative HTML references work offline; signed library URLs do not enter the source. Revisions preserve existing assets; new attachments cannot silently overwrite them. Other website SVGs/media can still be bundled by the host in project files or a complete ZIP. This adds no public-URL fetcher, migration, generation or charge.

Run `node --env-file=.env --conditions=react-server --import tsx scripts/test-motion-brand-assets.ts /path/to/public-reference-files /path/to/report` for the isolated fixture. It expects local `logo.png`, `hydrogen.webp`, `copper.webp`, `silicon.webp`; these are test inputs, not bundled product artwork. The normal brief is “Make a quick video for spaceoffice.ai.” The scripted real-OAuth MCP test proves record/library discovery, exact source attachments, duplicate-save safety, workspace denial, preservation through revisions, one 16-credit test render and hash-matched MP4/project downloads. It cleans its own test user, OAuth client and objects. This is a backend workflow test, not evidence that every host will infer every asset from a brief.

On 6 November 2026 the saved six-second, 1280×720/30fps output was decoded at 0.7, 2.8 and 5.3 seconds and visually checked: the official SpaceOffice logo and Hydrogen/Copper/Silicon images are visible. The fixture wallet changed 100→84, reserved 0; no fal.ai calls or production account credits. The Codex/Claude packages contain the updated discovery instructions. Existing installed hosts must load the updated package/schema; production worker/pricing gates are unchanged.
