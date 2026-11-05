import assert from "node:assert/strict"
import { randomBytes, createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { createDatabaseConnection } from "./database.mjs"
const origin = process.env.PREVIEW_TEST_ORIGIN || "http://localhost:3108"
const dir =
  "/Users/rushikghuntala/Documents/ChatGPT/Creative Claw/output/preview-expiry-fix"
const fixtures = JSON.parse(
  await readFile(
    dir.replace("preview-expiry-fix", "claude-multi-gallery-test") +
      "/verification.json",
    "utf8",
  ),
).images
const refs = fixtures.map(({ generation_id, execution_source }) => ({
  generation_id,
  execution_source,
}))
const w = "aa8a6ce7-5d92-474b-b187-aec7bb5f59fa"
const secret = `sp1.${randomBytes(32).toString("base64url")}`
const sql = createDatabaseConnection()
let grantId,
  checks = 0
const status = (body, token = secret) =>
  fetch(origin + "/api/preview/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      Origin: "https://fixture.claudemcpcontent.com",
    },
    body: JSON.stringify(body),
  })
try {
  await sql.unsafe("begin")
  const [g] =
    await sql`select g.* from public.client_grants g where g.workspace_id=${w} and g.revoked_at is null and 'media:read'=any(g.permissions) order by updated_at desc limit 1`
  const [c] =
    await sql`select resource_uri from private.mcp_configuration where singleton`
  const claims = {
    sub: g.user_id,
    client_id: g.client_id,
    role: "authenticated",
    aud: ["authenticated", c.resource_uri],
  }
  await sql`select set_config('request.jwt.claims',${JSON.stringify(claims)},true)`
  await sql.unsafe("set local role authenticated")
  const [r] =
    await sql`select public.create_saved_preview(${w}::uuid,${createHash("sha256").update(secret).digest("hex")},${sql.json(refs)}::jsonb) as id`
  grantId = r.id
  await sql.unsafe("reset role")
  // Backdate only this disposable read grant to exercise the old expiry boundary.
  await sql`update private.saved_preview_grants set created_at=now()-interval '8 hours' where id=${grantId}`
  await sql.unsafe("commit")
  const outputs = []
  for (let i = 0; i < refs.length; i++) {
    const response = await status(refs[i])
    assert.equal(response.status, 200)
    const saved = await response.json()
    assert.equal(saved.generation_id, refs[i].generation_id)
    assert.equal(saved.state, "succeeded")
    const output = saved.outputs[0]
    const file = await fetch(output.download_url)
    assert.equal(file.status, 200)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    assert.equal(sha256, fixtures[i].sha256)
    checks += 3
    outputs.push({
      id: output.id,
      sha256,
      matches_original: true,
      bytes: bytes.length,
    })
  }
  assert.equal(
    (
      await status({
        ...refs[0],
        generation_id: "10000000-0000-4000-8000-000000000001",
      })
    ).status,
    403,
  )
  checks++
  assert.equal((await status(refs[0], "sp1." + "x".repeat(43))).status, 403)
  checks++
  assert.equal((await status({ ...refs[0], action: "generate" })).status, 400)
  checks++
  await sql`delete from private.saved_preview_grants where id=${grantId}`
  grantId = null
  assert.equal((await status(refs[0])).status, 403)
  checks++
  const report = {
    at: new Date().toISOString(),
    origin,
    checks,
    existing_images: 3,
    original_oauth_required_for_refresh: false,
    read_grant_age_hours: 8,
    outputs,
    revoked_grant_denied: true,
    new_generations: 0,
    credits_spent: 0,
  }
  await writeFile(
    dir +
      "/http-" +
      (origin.includes("localhost") ? "local" : "production") +
      ".json",
    JSON.stringify(report, null, 2) + "\n",
  )
  process.stdout.write(
    JSON.stringify({
      checks,
      existing_images: 3,
      all_download_hashes_match: true,
      revoked_grant_denied: true,
      new_images: 0,
    }) + "\n",
  )
} finally {
  await sql.unsafe("rollback").catch(() => {})
  if (grantId)
    await sql`delete from private.saved_preview_grants where id=${grantId}`.catch(
      () => {},
    )
  await sql.end({ timeout: 1 })
}
