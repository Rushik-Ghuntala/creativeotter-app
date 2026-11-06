import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { randomBytes, createHash } from "node:crypto"
import { createDatabaseConnection } from "./database.mjs"
const main = async () => {
  const fixture = JSON.parse(
    await readFile("/tmp/creativeotter-render-qa.json", "utf8"),
  )
  const sql = createDatabaseConnection()
  const id = fixture.results[0].id,
    other = fixture.results[1].id
  const secret = `rp1.${randomBytes(32).toString("base64url")}`
  const origin = "https://local-test.claudemcpcontent.com"
  const call = (body: unknown, token = secret, from = origin) =>
    fetch("http://localhost:3001/api/render/preview", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: from,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
  try {
    await sql`update public.client_grants set revoked_at=null where user_id=${fixture.user} and client_id=${fixture.clients[0]}`
    await sql.begin(async (tx) => {
      await tx`set local role authenticated`
      await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: fixture.user, role: "authenticated", client_id: fixture.clients[0], aud: ["authenticated", `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp`] })},true)`
      await tx`select public.create_render_preview(${id},${createHash("sha256").update(secret).digest("hex")})`
    })
    const valid = await call({ render_id: id })
    assert.equal(valid.status, 200)
    assert.equal(valid.headers.get("access-control-allow-origin"), origin)
    const snapshot = await valid.json()
    assert.equal(snapshot.saved, true)
    assert.equal(snapshot.credit_status, "charged")
    assert.equal("input" in snapshot, false)
    const file = await fetch(snapshot.download_url)
    assert.equal(file.status, 200)
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await file.arrayBuffer()))
        .digest("hex"),
      fixture.results[0].sha256,
    )
    assert.equal((await call({ render_id: other })).status, 403)
    assert.equal((await call({ render_id: id }, "invalid")).status, 401)
    assert.equal(
      (await call({ render_id: id }, secret, "https://evil.example")).status,
      403,
    )
    assert.equal(
      (await call({ render_id: id, extra: "unexpected" })).status,
      403,
    )
    await sql`update public.client_grants set revoked_at=now() where user_id=${fixture.user} and client_id=${fixture.clients[0]}`
    assert.equal((await call({ render_id: id })).status, 403)
    process.stdout.write(
      "Passed localhost assistant-preview HTTP: private renewal/download, correct CORS, scope isolation, tamper denial and revocation. No rendering or charge.\n",
    )
  } finally {
    await sql`update public.client_grants set revoked_at=now() where user_id=${fixture.user} and client_id=${fixture.clients[0]}`
    await sql.end({ timeout: 1 })
  }
}
void main().catch((error) => {
  process.stderr.write(`Preview HTTP test failed: ${error.message}\n`)
  process.exitCode = 1
})
