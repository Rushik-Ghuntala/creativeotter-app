import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"

test("development OAuth renewal preserves changed preview settings and serves the fresh widget alias", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "motion-adapter-"))
  const configPath = path.join(directory, "config.json")
  const preload = path.join(directory, "fetch.mjs")
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        mcp_url: "http://localhost:3001/api/mcp",
        token_endpoint: "https://auth.example.test/token",
        client_id: "test-client",
        refresh_token: "test-refresh",
        expires_at: 0,
        preview_origin: "https://old.example.test",
      }),
      { mode: 0o600 },
    )
    await writeFile(
      preload,
      `
import { readFile, writeFile } from "node:fs/promises"
const configPath = process.argv[2]
globalThis.fetch = async (url, options) => {
  if (String(url).includes("auth.example.test")) {
    const current = JSON.parse(await readFile(configPath, "utf8"))
    current.preview_origin = "https://current.example.test"
    await writeFile(configPath, JSON.stringify(current), { mode: 0o600 })
    return Response.json({ access_token: "new-test-access", refresh_token: "new-test-refresh", expires_in: 3600 })
  }
  if (String(url) !== "http://localhost:3001/api/mcp") throw new Error("Unexpected network target")
  const message = JSON.parse(options.body)
  const uri = "ui://creativeotter/render-v2.html"
  if (message.method === "resources/read" && message.params.uri !== uri) throw new Error("Widget alias was not translated")
  const meta = { ui: { domain: "old", csp: { connectDomains: [] } }, "openai/widgetCSP": { connect_domains: [] } }
  const result = message.method === "resources/read"
    ? { contents: [{ uri: message.params.uri, text: "saved-player", _meta: meta }] }
    : { resources: [{ uri, _meta: meta }, { uri: "ui://creativeotter/account.html" }] }
  return Response.json({ jsonrpc: "2.0", id: message.id, result })
}
`,
    )
    const messages = [
      { jsonrpc: "2.0", id: 1, method: "resources/list" },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "resources/read",
        params: { uri: "ui://creativeotter-dev/render-v3.html" },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "manage_assets", arguments: { action: "delete" } },
      },
    ]
    const output = execFileSync(
      process.execPath,
      ["--import", preload, "scripts/native-motion-dev-mcp.mjs", configPath],
      {
        cwd: process.cwd(),
        input:
          messages.map((message) => JSON.stringify(message)).join("\n") + "\n",
        encoding: "utf8",
        timeout: 10000,
      },
    )
    const responses = output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    const listed = responses.find((response) => response.id === 1).result
      .resources
    assert.equal(listed.length, 1)
    assert.equal(listed[0].uri, "ui://creativeotter-dev/render-v3.html")
    assert.deepEqual(listed[0]._meta.ui.csp.connectDomains, [
      "https://current.example.test",
    ])
    const content = responses.find((response) => response.id === 2).result
      .contents[0]
    assert.equal(content.uri, listed[0].uri)
    assert.equal(content.text, "saved-player")
    assert.deepEqual(content._meta["openai/widgetCSP"].connect_domains, [
      "https://current.example.test",
    ])
    assert.match(
      responses.find((response) => response.id === 3).error.message,
      /read-only/,
    )
    const saved = JSON.parse(await readFile(configPath, "utf8"))
    assert.equal(saved.preview_origin, "https://current.example.test")
    assert.equal(saved.access_token, "new-test-access")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
