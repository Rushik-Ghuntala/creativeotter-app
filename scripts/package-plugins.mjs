import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const argumentsList = process.argv.slice(2)
const appFlag = argumentsList.indexOf("--chatgpt-app-id")
const appId = appFlag >= 0 ? argumentsList[appFlag + 1] : undefined
if (appFlag >= 0) argumentsList.splice(appFlag, 2)
const sourceArgument = argumentsList[0] || process.env.CREATIVEOTTER_SKILLS_DIR
if (!sourceArgument || argumentsList.length > 1 || (appFlag >= 0 && !appId))
  throw new Error(
    "Usage: yarn package:plugins /path/to/creativeotter-skills [--chatgpt-app-id actual-registered-app-id]",
  )
if (
  appId &&
  !/^(asdk_app|connector|templated_apps)_[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(
    appId,
  )
)
  throw new Error(
    "Use the actual registered ChatGPT app ID, not an uploaded plugin ID",
  )
const source = path.resolve(sourceArgument)
const config = JSON.parse(
  await readFile(path.join(source, "config/plugin.json"), "utf8"),
)
if (config.name !== "creativeotter" || !/^\d+\.\d+\.\d+$/.test(config.version))
  throw new Error(
    "Expected the CreativeOtter skills repository and a release version",
  )

execFileSync("npm", ["run", "package:test-kit"], {
  cwd: source,
  stdio: "inherit",
})
const kit = path.join(source, "dist/test-kit/creativeotter-test-kit")
const metadata = JSON.parse(
  await readFile(path.join(kit, "TEST-KIT.json"), "utf8"),
)
if (
  metadata.credentials_included !== false ||
  metadata.version !== config.version
)
  throw new Error("Unexpected plugin release metadata")
const destination = path.join(root, "plugins/creativeotter")
await mkdir(destination, { recursive: true })
const inputs = [
  path.join(
    source,
    "releases",
    `creativeotter-test-kit-v${config.version}.zip`,
  ),
  path.join(
    kit,
    "install",
    `creativeotter-codex-desktop-v${config.version}.zip`,
  ),
  path.join(kit, "install", `creativeotter-claude-v${config.version}.zip`),
]
if (appId) {
  execFileSync("npm", ["run", "package:chatgpt-web", "--", "--app-id", appId], {
    cwd: source,
    stdio: "inherit",
  })
  inputs.push(
    path.join(
      source,
      "releases",
      `creativeotter-chatgpt-web-v${config.version}.zip`,
    ),
  )
}
const archives = []
for (const input of inputs) {
  const filename = path.basename(input)
  const bytes = await readFile(input)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  await copyFile(input, path.join(destination, filename))
  archives.push({ filename, bytes: bytes.length, sha256 })
}
await writeFile(
  path.join(destination, "SHA256SUMS"),
  archives.map(({ filename, sha256 }) => `${sha256}  ${filename}`).join("\n") +
    "\n",
)
await writeFile(
  path.join(destination, "release.json"),
  JSON.stringify(
    {
      product: "CreativeOtter",
      skills_version: config.version,
      skill_count_per_plugin: metadata.skill_count_per_plugin,
      mcp_url: metadata.mcp_url,
      authentication: metadata.authentication,
      credentials_included: false,
      generation_on_install: false,
      marketplace_approved: false,
      source_repository: config.repository,
      source_commit: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: source,
        encoding: "utf8",
      }).trim(),
      source_has_local_changes: Boolean(
        execFileSync("git", ["status", "--porcelain"], {
          cwd: source,
          encoding: "utf8",
        }).trim(),
      ),
      chatgpt_web: appId
        ? {
            registered_app_id: appId,
            account_scoped_reference: true,
            live_install_verified_by_packaging: false,
          }
        : null,
      archives,
    },
    null,
    2,
  ) + "\n",
)
process.stdout.write(`CreativeOtter plugin ZIPs saved in ${destination}\n`)
