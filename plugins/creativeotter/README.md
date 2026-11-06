# CreativeOtter test plugins

Use the package matching the assistant. The previous `creativeotter-chatgpt-codex-v0.5.3.zip` was classified **Desktop only** in ChatGPT web, even with an HTTPS server. It remains here as a historical archive; use the corrected packages below.

| File | Use |
| --- | --- |
| `creativeotter-chatgpt-web-v0.5.4.zip` | ChatGPT web: 21 skills referencing the registered CreativeOtter Web app in the account where it was created |
| `creativeotter-codex-desktop-v0.5.4.zip` | Codex desktop / CLI: 21 skills and direct MCP configuration |
| `creativeotter-claude-v0.5.4.zip` | Claude Code / compatible plugin upload: 21 skills and direct MCP configuration |
| `creativeotter-test-kit-v0.5.4.zip` | Extract first for Codex/Claude folders, both desktop upload ZIPs, setup notes and other client examples |

No API keys, login sessions, private images or account data are bundled. Installing does not generate media or spend credits. Historical ZIPs retain their original bytes. `SHA256SUMS` covers the current release.

## ChatGPT web

1. In the intended account, open Plugins > Add > Add custom MCP server.
2. Name it CreativeOtter Web, enter `https://creativeotter-app.vercel.app/api/mcp`, choose OAuth and automatic/DCR registration, and create it as a plugin.
3. Connect it and sign into your own CreativeOtter account. This remote connection provides the hosted tools and previews.
4. To add all 21 skills, upload the separate web ZIP using Plugins > Add > Upload plugin archive. The referenced app must be available in this account/workspace. A successful import should offer web use rather than **Open in desktop app**.
5. In a new chat, select the plugin from the mention picker or use **Try in chat**. Typing an unselected `@creativeotter` is just ordinary text.

**The supplied web ZIP references the custom app created for the tested account. It is not a universal connection for unrelated accounts.** If another account cannot access that registered app, register a custom remote connection there, copy its actual app ID from its plugin details URL, and rebuild using that ID. An uploaded `Plugin_...` ID is not the registered app ID. A ZIP cannot register or authorize an app for every account. Broader distribution requires a registered app available to those users.

The web package includes `.app.json` and no raw MCP server declarations, local launch commands or hooks. Simply putting an HTTPS MCP URL into the desktop archive does not make it web compatible. Packaging validation does not prove a live import or account login; test those separately.

## Other clients

**Codex:** extract the test kit and use its local marketplace instructions, or its Codex desktop ZIP where supported. Complete MCP OAuth in the client.

**Claude:** Claude Code plugins and Claude chat/Cowork connectors use different installation paths. For a remote connector, add the endpoint and complete OAuth in the app. For Code, extract the kit and run `claude --plugin-dir ./plugins/claude`, then authenticate through `/mcp`.

**Grok Bot:** add the remote endpoint through the Bot's custom MCP support. ZIP import and CreativeOtter's embedded gallery have not been tested there. **Grok Build** separately documents Claude-compatible plugin folders.

Other assistants need remote Streamable HTTP MCP and OAuth support; embedded previews depend on the host. These archives supply skills and connection settings, not image models or unavailable backend features.

## Read-only checks

> Is my CreativeOtter account connected? How many credits do I have left?

> Show my three latest saved CreativeOtter images together, please. Don't create anything new.

Saved-image views and downloads do not create a new generation charge. New generation uses the current server quote.

## Rebuild

```sh
yarn package:plugins /absolute/path/to/creativeotter-skills
```

To include a web ZIP referencing an actual registered app available to the intended user:

```sh
yarn package:plugins /absolute/path/to/creativeotter-skills --chatgpt-app-id asdk_app_ACTUAL_REGISTERED_ID
```

The app ID is a public configuration reference, not a token. Do not substitute a made-up ID. The supplied web archive's real reference is recorded in `release.json`.

Alternatively set `CREATIVEOTTER_SKILLS_DIR`. Rebuilding copies only allowlisted public artifacts; it does not install plugins, change client settings or call media providers. Verify with `shasum -a 256 -c SHA256SUMS`. `release.json` records the source revision and whether it had local changes.

## Official references

- [ChatGPT desktop-only classification and registered app references](https://learn.chatgpt.com/docs/enterprise/plugin-management)
- [ChatGPT remote MCP connections](https://learn.chatgpt.com/docs/extend/mcp)
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Claude plugins](https://code.claude.com/docs/en/plugins)
- [Grok Bot connections](https://docs.x.ai/grok-bot/computer-and-apps)
- [Grok Build plugin compatibility](https://docs.x.ai/build/features/skills-plugins-marketplaces)

Checked on 6 November 2026. These are test packages, not public-directory-approved listings.

## Observed web test

On 6 November 2026, the v0.5.4 web ZIP was uploaded from this directory into the account containing its registered app. ChatGPT showed **Your cloud plugin**, **Apps 1** and **Skills 21**. After installation, **Try in chat** opened a working account panel and a three-image saved gallery. Gallery navigation, refresh (**Preview up to date**) and one existing-image download completed successfully. No new generation was performed or charged. This is an account-scoped test, not proof of public or cross-account distribution.
