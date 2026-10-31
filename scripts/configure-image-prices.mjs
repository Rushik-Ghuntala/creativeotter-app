import { createDatabaseConnection } from "./database.mjs"

const [workspaceId, displayCredits] = process.argv.slice(2)
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    workspaceId || "",
  )
)
  throw new Error("Provide a workspace UUID")
if (!/^\d{1,10}(?:\.\d{1,3})?$/.test(displayCredits || ""))
  throw new Error(
    "Provide a positive display credit amount, at most 3 decimals",
  )
const [whole, fraction = ""] = displayCredits.split(".")
const units = BigInt(whole) * BigInt(1000) + BigInt(fraction.padEnd(3, "0"))
if (units <= BigInt(0) || units > BigInt("1000000000000"))
  throw new Error(
    "Credit price must be positive and within the supported limit",
  )
const sql = createDatabaseConnection()
try {
  const version = `standard-image-${new Date().toISOString()}`
  await sql.begin(async (tx) => {
    for (const model of ["native:image", "image/nano-banana-2"]) {
      await tx`insert into private.workspace_credit_prices(workspace_id,model_key,version,credit_units,valid_until,enabled) values(${workspaceId},${model},${version},${units.toString()},now()+interval '30 days',true) on conflict(workspace_id,model_key) do update set version=excluded.version,credit_units=excluded.credit_units,valid_until=excluded.valid_until,enabled=true`
    }
  })
  process.stdout.write(
    "Configured the same positive standard-image credit price for native and API routes. No credits issued or provider spending enabled.\n",
  )
} finally {
  await sql.end({ timeout: 1 })
}
