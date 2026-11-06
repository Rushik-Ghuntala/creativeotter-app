# CreativeOtter native motion testing — 6 November 2026

CreativeOtter Dev 0.10.2 uses the local Next.js backend at localhost:3001, the dedicated local renderer and a disposable Supabase workspace. Its Codex and Claude connections have separate real OAuth clients and private mode-0600 token files. No provider generation, production wallet, production prices, deployment or push was used.

Both native apps authored, saved and started one 30-second 1920×1080, 30fps video through CreativeOtter. The wallet had 100 test credits and now has 68, zero reserved and exactly two 16-credit charges. Reopens, refreshes, source ZIP downloads and MP4 downloads made no additional charges. Both MP4 files have 900 H.264 frames and match their database SHA-256. Both editable source archives were downloaded.

Claude's first live card revealed a real refresh defect. The implementation now preserves connector namespaces, validates the refreshed render ID, bounds transport failures, retains host fallback after blocked HTTP, supports old resource URIs and a fresh versioned widget, recovers cached same-video credentials and preserves playback position and pause state across signed-link renewal. Simultaneous refresh/download actions share one read.

Claude's local Code session now displays its branded ready player. The user confirmed playback and the actual Download button. Its downloaded SpaceOffice-One-brief-Your-AI-team-.mp4 matches SHA-256 4c3f45cc4b55812ed86b89e03b66bad931bccb20248f1fa3bcb6ebe60239e243. A real native refresh increased the approved relay counter from 38 to 40 (POST and preflight), with HTTP 200/204 and zero proxy errors. The latest player improvements are also verified in the component regression.

Codex's original test connection loaded stale instructions; a separately approved older connection-test chat loaded the new Dev plugin. Native get_render calls, automatic OAuth refresh after the original access token expired, direct browser playback and a byte-matched downloaded MP4 are confirmed. Its embedded widget controls were not accessible for visual inspection in the background chat; do not describe that as a completed native-widget click test.

77 backend tests, targeted lint and TypeScript checks passed. The real player component's browser regression passes playback position, paused position, simultaneous refresh/download, automatic visibility refresh and temporary-outage recovery. It uses only the existing local MP4 and no backend/billing calls. See proof/player-regression.json. This is separate from native-host evidence.

The user explicitly approved a temporary Cloudflare HTTPS relay because the native sandbox rejected localhost and host callbacks. The relay accepts only POST/OPTIONS at /api/render/preview and exactly the two disposable saved-video IDs, still requiring their scoped credential and current workspace/client grant checks. All other IDs, MCP and write paths are denied. This is a development test service, not production hosting. Local app, worker and approved tunnel must remain running for this Dev setup. Rendering prices expire after one day; real production rendering remains disabled.

Private token files and fixture metadata remain under /tmp and are never included in plugin packages. No secrets are stored in this report. Unmodified upstream skills remain untouched. Machine-specific Dev packages are under creativeotter-skills/dist/native-motion; their adapter source is in the app repo's scripts/native-motion-dev-mcp.mjs. Standard release ZIPs and production connections are unchanged.

Artifacts: codex/spaceoffice-motion.mp4, claude/spaceoffice-motion.mp4, both editable-project.zip files, credit-verification.json, delivery-verification.json and proof/.
