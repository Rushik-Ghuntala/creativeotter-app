import { createDatabaseConnection } from "./database.mjs"

const workspaceId = process.argv[2]
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    workspaceId || "",
  )
)
  throw new Error("Provide a workspace UUID")
const sql = createDatabaseConnection()
try {
  await sql`insert into private.workspace_generation_limits(workspace_id,enabled,daily_budget_micro_usd) values(${workspaceId},true,0) on conflict(workspace_id) do update set enabled=true,daily_budget_micro_usd=0`
  process.stdout.write(
    "Native image preview enabled with zero provider budget. Native generation still requires configured pricing, sufficient credits and browser approval. Existing client grants are unchanged.\n",
  )
} finally {
  await sql.end({ timeout: 1 })
}
