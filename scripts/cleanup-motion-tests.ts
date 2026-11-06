import assert from "node:assert/strict"
import { readFile, rm } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { createDatabaseConnection } from "./database.mjs"
import type { Database } from "../src/lib/database.types"
const main = async () => {
  const spaceoffice = process.argv.includes("--spaceoffice")
  const fixtureFile = spaceoffice
    ? "/tmp/creativeotter-spaceoffice-motion-qa.json"
    : "/tmp/creativeotter-motion-qa.json"
  const fixture = JSON.parse(await readFile(fixtureFile, "utf8"))
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const sql = createDatabaseConnection()
  try {
    for (const id of fixture.users) {
      const user = await admin.auth.admin.getUserById(id)
      assert.match(
        user.data.user?.email || "",
        spaceoffice
          ? /^render-test-[a-f0-9-]+@example\.com$/
          : /^motion-(test|other)-[a-f0-9-]+@example\.com$/,
      )
      const [sources, renders] = await Promise.all([
        admin.from("motion_revisions").select("source_path").eq("user_id", id),
        admin.from("render_jobs").select("storage_path").eq("user_id", id),
      ])
      if (sources.data?.length)
        assert.equal(
          (
            await admin.storage
              .from("creativeotter-motion-sources")
              .remove(sources.data.map((row) => row.source_path))
          ).error,
          null,
        )
      const outputs =
        renders.data?.flatMap((row) =>
          row.storage_path ? [row.storage_path] : [],
        ) || []
      if (outputs.length)
        assert.equal(
          (await admin.storage.from("creativeotter-renders").remove(outputs))
            .error,
          null,
        )
      assert.equal((await admin.auth.admin.deleteUser(id)).error, null)
    }
    for (const id of fixture.clients || [])
      assert.equal((await admin.auth.admin.oauth.deleteClient(id)).error, null)
    await rm(fixtureFile)
    const rows =
      await sql`select count(*)::int as count from private.workspace_render_settings where enabled`
    console.log(
      JSON.stringify({
        disposable_users_removed: fixture.users.length,
        remaining_enabled_workspaces: rows[0].count,
        main_account_untouched: true,
      }),
    )
  } finally {
    await sql.end({ timeout: 1 })
  }
}
void main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
