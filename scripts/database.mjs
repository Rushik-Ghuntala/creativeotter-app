import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

export const normalizeDatabaseUrl = (raw) => {
  if (!raw || !/^postgres(?:ql)?:\/\//.test(raw))
    throw new Error("Set SUPABASE_DB_URL")
  const at = raw.lastIndexOf("@")
  const colon = raw.indexOf(":", raw.indexOf("://") + 3)
  if (at < 0 || colon < 0 || colon > at)
    throw new Error("Database URL must include credentials")
  let password = raw.slice(colon + 1, at)
  try {
    password = decodeURIComponent(password)
  } catch {
    /* A literal percent is encoded below. */
  }
  const normalized =
    raw.slice(0, colon + 1) + encodeURIComponent(password) + raw.slice(at)
  try {
    new URL(normalized)
  } catch {
    throw new Error("Invalid database URL; credentials omitted")
  }
  return normalized
}

export const createDatabaseConnection = () =>
  postgres(normalizeDatabaseUrl(process.env.SUPABASE_DB_URL), {
    ssl: "require",
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
  })

const main = async () => {
  process.loadEnvFile(".env")
  const command = process.argv[2]
  if (command === "configure") {
    const origin = new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    if (!origin.startsWith("https://"))
      throw new Error("A deployed HTTPS app URL is required")
    const sql = createDatabaseConnection()
    try {
      await sql`update private.mcp_configuration set resource_uri = ${`${origin}/api/mcp`} where singleton`
      process.stdout.write(
        "MCP resource configured. Enable the OAuth server and token hook in Supabase Dashboard separately.\n",
      )
    } finally {
      await sql.end({ timeout: 1 })
    }
    return
  }
  if (!["push", "dry-run", "list"].includes(command))
    throw new Error("Use push, dry-run, list or configure")
  const url = normalizeDatabaseUrl(process.env.SUPABASE_DB_URL)
  const args =
    command === "list"
      ? ["migration", "list", "--db-url", url]
      : [
          "db",
          "push",
          "--db-url",
          url,
          "--yes",
          ...(command === "dry-run" ? ["--dry-run"] : []),
        ]
  const result = spawnSync("supabase", args, { encoding: "utf8" })
  const secrets = [
    process.env.SUPABASE_DB_URL,
    url,
    new URL(url).password,
    decodeURIComponent(new URL(url).password),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean)
  const redact = (text) =>
    secrets.reduce(
      (safe, secret) => safe.replaceAll(secret, "[redacted]"),
      text || "",
    )
  process.stdout.write(redact(result.stdout))
  process.stderr.write(redact(result.stderr))
  if (result.status !== 0)
    throw new Error("Supabase command failed; review the redacted output")
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(
      "Database operation failed. Credentials were omitted.\n",
    )
    process.exitCode = 1
  })
}
