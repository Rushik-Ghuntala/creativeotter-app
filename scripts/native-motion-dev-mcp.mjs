import { readFile, writeFile, stat } from "node:fs/promises"
import { createInterface } from "node:readline"
const configPath = process.argv[2]
const previewResource = "ui://creativeotter-dev/render-v3.html"
const allowed = new Set([
  "get_capabilities",
  "discover_brand_assets",
  "manage_assets",
  "manage_themes",
  "manage_characters",
  "save_motion_project",
  "revise_motion_project",
  "get_motion_project",
  "list_motion_projects",
  "prepare_motion_upload",
  "confirm_motion_upload",
  "prepare_render",
  "render_design",
  "get_render",
  "list_renders",
])
const info = await stat(configPath)
if (info.mode & 0o077)
  throw new Error("Development credentials must be private")
let config = JSON.parse(await readFile(configPath, "utf8"))
const target = new URL(config.mcp_url)
if (
  target.hostname !== "localhost" ||
  target.protocol !== "http:" ||
  target.pathname !== "/api/mcp"
)
  throw new Error("Development MCP must stay on localhost")
let refreshing
const accessToken = async () => {
  if (Date.now() < config.expires_at - 60000) return config.access_token
  refreshing ||= (async () => {
    const response = await fetch(config.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: config.client_id,
        refresh_token: config.refresh_token,
      }),
    })
    if (!response.ok) throw new Error("Reconnect the development test account")
    const token = await response.json()
    const current = JSON.parse(await readFile(configPath, "utf8"))
    config = {
      ...current,
      access_token: token.access_token,
      refresh_token: token.refresh_token || config.refresh_token,
      expires_at: Date.now() + token.expires_in * 1000,
    }
    await writeFile(configPath, JSON.stringify(config), { mode: 0o600 })
    return config.access_token
  })().finally(() => {
    refreshing = undefined
  })
  return refreshing
}
const rewrite = (result, previewOrigin) => {
  if (
    [
      "ui://creativeotter/render-v1.html",
      "ui://creativeotter/render-v2.html",
    ].includes(result)
  )
    return previewResource
  if (!result || typeof result !== "object") return result
  if (Array.isArray(result))
    return result.map((value) => rewrite(value, previewOrigin))
  const next = Object.fromEntries(
    Object.entries(result).map(([k, v]) => [k, rewrite(v, previewOrigin)]),
  )
  if (next["creativeotter/render-access"])
    next["creativeotter/render-access"].url =
      `${previewOrigin}/api/render/preview`
  if (
    [
      "ui://creativeotter/render-v1.html",
      "ui://creativeotter/render-v2.html",
      previewResource,
    ].includes(next.uri) &&
    next._meta
  ) {
    next._meta.ui.domain = "https://creativeotter-dev.invalid"
    next._meta.ui.csp.connectDomains = [previewOrigin]
    next._meta["openai/widgetCSP"].connect_domains = [previewOrigin]
  }
  return next
}
let protocol = "2025-03-26"
const handle = async (message) => {
  try {
    if (message.method === "initialize")
      protocol = message.params.protocolVersion
    if (
      (message.method === "tools/call" && !allowed.has(message.params?.name)) ||
      (message.method === "resources/read" &&
        ![
          "ui://creativeotter/render-v1.html",
          "ui://creativeotter/render-v2.html",
          previewResource,
        ].includes(message.params?.uri))
    )
      throw new Error(
        "This development connection is limited to motion graphics",
      )
    if (
      message.method === "tools/call" &&
      ["manage_assets", "manage_themes", "manage_characters"].includes(
        message.params?.name,
      ) &&
      !["list", "get"].includes(message.params?.arguments?.action || "list")
    )
      throw new Error(
        "Brand and artwork discovery is read-only in this development connection",
      )
    const response = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": protocol,
      },
      body: JSON.stringify(
        message.method === "resources/read" &&
          message.params?.uri === previewResource
          ? {
              ...message,
              params: {
                ...message.params,
                uri: "ui://creativeotter/render-v2.html",
              },
            }
          : message,
      ),
      signal: AbortSignal.timeout(120000),
    })
    if (message.id === undefined) return
    if (!response.ok)
      throw new Error(`Development connection returned ${response.status}`)
    const payload = await response.json()
    if (message.method === "tools/list" && payload.result?.tools)
      payload.result.tools = payload.result.tools.filter((t) =>
        allowed.has(t.name),
      )
    if (message.method === "resources/list" && payload.result?.resources)
      payload.result.resources = payload.result.resources.filter(
        (r) => r.uri === "ui://creativeotter/render-v2.html",
      )
    const current = JSON.parse(await readFile(configPath, "utf8"))
    const previewOrigin = new URL(current.preview_origin || target.origin)
    if (
      previewOrigin.username ||
      previewOrigin.password ||
      previewOrigin.search ||
      previewOrigin.hash ||
      previewOrigin.pathname !== "/" ||
      (previewOrigin.protocol !== "https:" &&
        previewOrigin.origin !== target.origin)
    )
      throw new Error("Invalid development preview origin")
    process.stdout.write(
      `${JSON.stringify(rewrite(payload, previewOrigin.origin))}\n`,
    )
  } catch (error) {
    if (message.id !== undefined)
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: error.message } })}\n`,
      )
  }
}
createInterface({ input: process.stdin }).on("line", (line) => {
  try {
    void handle(JSON.parse(line))
  } catch {
    process.stderr.write("Invalid development request\n")
  }
})
