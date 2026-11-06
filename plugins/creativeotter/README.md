# CreativeOtter test plugins

Start with **creativeotter-test-kit-v0.5.3.zip**. Extract it for setup notes, both plugin folders, per-client configuration examples, ordinary test prompts, checksums and license notices.

If your client asks for a plugin ZIP, choose the matching standalone file:

| File                                     | Use                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `creativeotter-chatgpt-codex-v0.5.3.zip` | ChatGPT/Codex compatible plugin package; local marketplace or upload controls where offered                  |
| `creativeotter-claude-v0.5.3.zip`        | Claude-compatible plugin package; folder/marketplace install for Claude Code, or a compatible upload control |

Each plugin contains all 21 skills and connects to `https://creativeotter-app.vercel.app/api/mcp`. Sign in separately in each assistant. No API keys, login sessions, private images or account data are bundled. Installing does not generate media or spend credits.

**ChatGPT:** local packages use the supported Codex compatibility manifest. A custom remote MCP connection may need to be created through Plugins > Add custom MCP server before testing. A ZIP attachment in a regular chat does not automatically install a plugin. Follow the kit README and the client's available installation controls.

**Claude:** Claude Code plugins and Claude chat/Cowork remote connectors use different installation paths. For a remote connector, add the endpoint and complete OAuth in the app. For Code, extract the kit and run `claude --plugin-dir ./plugins/claude`, then authenticate through `/mcp`.

**Grok Bot:** ask the Bot to add the remote MCP endpoint and help you sign in. Its custom MCP support is documented; a generic plugin ZIP importer and CreativeOtter's embedded gallery have not been tested there. **Grok Build** separately documents Claude-compatible plugin folders and can use `plugins/claude` from the extracted kit.

**Other assistants:** use the endpoint only if the client supports remote Streamable HTTP MCP with OAuth. Embedded previews and native image tools depend on the host. The ZIP is a collection of skills and connection settings; it does not supply image models or enable unavailable backend features.

Try these free checks:

> Is my CreativeOtter account connected? How many credits do I have left?

> Show my three latest saved CreativeOtter images together, please. Don't create anything new.

New generation uses your account's current CreativeOtter credit price. Saved-image views and downloads do not create a new charge.

## Rebuild from the skills repository

From this app repository:

```sh
yarn package:plugins /absolute/path/to/creativeotter-skills
```

Or set `CREATIVEOTTER_SKILLS_DIR` and run `yarn package:plugins`. This rebuilds and copies only the allowlisted public plugin artifacts. It does not install anything, change client settings, or contact a media provider.

Verify the files from this directory with `shasum -a 256 -c SHA256SUMS`. The kit also contains per-file checksums. `release.json` records the source revision and whether it had local modifications when packaged.

## Official installation references

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Claude plugins](https://code.claude.com/docs/en/plugins)
- [Grok Bot connections](https://docs.x.ai/grok-bot/computer-and-apps)
- [Grok Build plugin compatibility](https://docs.x.ai/build/features/skills-plugins-marketplaces)

Format guidance was checked on 6 November 2026. These local test packages are not public-directory-approved plugins. Codex and Claude have been exercised with the shared backend; the packaging process does not prove installation in a different account or every other client.
