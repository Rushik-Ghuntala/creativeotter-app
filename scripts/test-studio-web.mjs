import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServerClient } from "@supabase/ssr"
const main = async () => {
  const state = JSON.parse(
      await readFile("/tmp/creativeotter-local-qa.json", "utf8"),
    ),
    jar = new Map()
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (values) =>
          values.forEach(({ name, value }) => jar.set(name, value)),
      },
    },
  )
  assert.equal(
    (
      await client.auth.signInWithPassword({
        email: state.email,
        password: state.password,
      })
    ).error,
    null,
  )
  const headers = {
      cookie: Array.from(jar, ([name, value]) => `${name}=${value}`).join("; "),
    },
    origin = "http://localhost:3001"
  for (const path of [
    "/studio",
    "/account",
    "/studio/characters",
    "/studio/films",
    "/studio/voices",
    "/studio/music",
    "/studio/projects",
    "/studio/brands",
    "/studio/library",
    "/studio/create",
    "/connect",
  ]) {
    const response = await fetch(origin + path, { headers, redirect: "manual" })
    assert.equal(response.status, 200, `${path} failed`)
    const html = await response.text()
    assert.ok(
      !html.includes('id="__next_error__"'),
      `${path} returned an error shell`,
    )
  }
  const anonymous = await fetch(origin + "/studio", { redirect: "manual" })
  assert.equal(anonymous.status, 307)
  assert.ok(anonymous.headers.get("location").startsWith("/auth/login"))
  const anonymousLedger = await fetch(origin + "/api/account/ledger", {
    redirect: "manual",
  })
  assert.equal(anonymousLedger.status, 307)
  const ledger = await fetch(origin + "/api/account/ledger", {
    headers,
    redirect: "manual",
  })
  assert.equal(ledger.status, 200)
  assert.ok(ledger.headers.get("content-type").startsWith("text/csv"))
  assert.ok((await ledger.text()).includes('"Amount (credit units)"'))
  const film = await client
    .from("studio_projects")
    .select("id")
    .eq("workspace_id", state.workspace_id)
    .eq("kind", "film")
    .limit(1)
    .single()
  assert.equal(film.error, null)
  const exported = await fetch(
    origin + `/api/studio/projects/${film.data.id}/export`,
    { headers },
  )
  assert.equal(exported.status, 200)
  const payload = await exported.json()
  assert.equal(payload.product, "CreativeOtter")
  assert.ok(payload.shots.length >= 4)
  assert.equal(payload.budget_target_is_enforced, false)
  assert.equal(payload.historical_assigned_charge_units, "0")
  assert.ok(!JSON.stringify(payload).includes('"execution_token"'))
  await client.auth.signOut({ scope: "local" })
  process.stdout.write(
    "PASS: authenticated local Studio/account routes, anonymous access protection, real CSV export, film/storyboard JSON export and no execution-token exposure.\n",
  )
}
main().catch((error) => {
  process.stderr.write(`${error.name}: ${error.message}\n`)
  process.exitCode = 1
})
