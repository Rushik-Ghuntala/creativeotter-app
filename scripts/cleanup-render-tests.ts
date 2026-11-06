import { readFile, rm } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/lib/database.types"
import { RENDER_BUCKET } from "../src/lib/render/contracts"
const main = async () => {
  const file = "/tmp/creativeotter-render-qa.json"
  const fixture = JSON.parse(await readFile(file, "utf8"))
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  for (const id of fixture.users) {
    const user = await admin.auth.admin.getUserById(id)
    if (
      user.error ||
      !user.data.user.email?.startsWith("render-test-") ||
      !user.data.user.email?.endsWith("@example.com")
    )
      throw new Error("Cleanup is restricted to disposable render fixtures")
  }
  if (
    !fixture.objects.every((path: string) =>
      path.startsWith(`${fixture.workspace}/`),
    )
  )
    throw new Error("Invalid fixture path")
  if (fixture.objects.length) {
    const result = await admin.storage
      .from(RENDER_BUCKET)
      .remove(fixture.objects)
    if (result.error) throw new Error("Unable to remove test files")
  }
  for (const client of fixture.clients)
    await admin.auth.admin.oauth.deleteClient(client)
  for (const id of fixture.users) {
    const result = await admin.auth.admin.deleteUser(id)
    if (result.error) throw new Error("Unable to remove disposable user")
  }
  await rm(file)
  process.stdout.write(
    "Removed disposable rendering users, OAuth client, credits and private test files. Local proof files remain.\n",
  )
}
void main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
