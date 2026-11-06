import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const sourceArgument = process.argv[2] || process.env.CREATIVEOTTER_SKILLS_DIR
if (!sourceArgument || process.argv.length > 3)
  throw new Error("Usage: yarn package:plugins /path/to/creativeotter-skills")
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
    `creativeotter-chatgpt-codex-v${config.version}.zip`,
  ),
  path.join(kit, "install", `creativeotter-claude-v${config.version}.zip`),
]
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
      archives,
    },
    null,
    2,
  ) + "\n",
)
process.stdout.write(`CreativeOtter plugin ZIPs saved in ${destination}\n`)
