import assert from "node:assert/strict"
import { randomBytes, createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createDatabaseConnection } from "./database.mjs"
const sql = createDatabaseConnection()
const workspace = "aa8a6ce7-5d92-474b-b187-aec7bb5f59fa"
const refs = [
  {
    execution_source: "native",
    generation_id: "783fc0ac-c72b-447e-b4e6-09cf8476e4af",
  },
  {
    execution_source: "provider",
    generation_id: "ad1ed3a1-6411-4d3e-a465-e2cb7cad6322",
  },
  {
    execution_source: "provider",
    generation_id: "2192a7f9-46d2-49c7-8351-0394e29e982f",
  },
]
const secret = `sp1.${randomBytes(32).toString("base64url")}`
const hash = createHash("sha256").update(secret).digest("hex")
let passed = 0
const role = async (value) => {
  assert.ok(["anon", "authenticated"].includes(value))
  await sql.unsafe(`set local role ${value}`)
}
const reset = () => sql.unsafe("reset role")
const read = async (reference = refs[0], token = secret) => {
  const [r] =
    await sql`select public.read_saved_preview(${token},${reference.execution_source},${reference.generation_id}::uuid) as data`
  return r.data
}
const denied = async (callback) => {
  await sql.unsafe("savepoint denied")
  let rejected = false
  try {
    await callback()
  } catch {
    rejected = true
  }
  await sql.unsafe("rollback to savepoint denied")
  await sql.unsafe("release savepoint denied")
  assert.ok(rejected, "Expected permission denial")
  passed++
}
const deniedChange = async (callback) => {
  await sql.unsafe("savepoint change")
  await reset()
  await callback()
  await role("anon")
  await denied(() => read())
  await sql.unsafe("rollback to savepoint change")
  await sql.unsafe("release savepoint change")
  await reset()
}
try {
  await sql.unsafe("begin")
  if (process.argv.includes("--review-migration"))
    await sql.unsafe(
      await readFile(
        "supabase/migrations/20261105000000_saved_preview_grants.sql",
        "utf8",
      ),
    )
  const [grant] =
    await sql`select g.* from public.client_grants g where g.workspace_id=${workspace} and g.revoked_at is null and 'media:read'=any(g.permissions) order by g.updated_at desc limit 1`
  assert.ok(grant)
  const [config] =
    await sql`select resource_uri from private.mcp_configuration where singleton`
  const claims = {
    sub: grant.user_id,
    client_id: grant.client_id,
    role: "authenticated",
    aud: ["authenticated", config.resource_uri],
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  await sql`select set_config('request.jwt.claims',${JSON.stringify(claims)},true)`
  await role("authenticated")
  const [created] =
    await sql`select public.create_saved_preview(${workspace}::uuid,${hash},${sql.json(refs)}::jsonb) as id`
  assert.ok(created.id)
  passed++
  await denied(
    () =>
      sql`select public.create_saved_preview('10000000-0000-4000-8000-000000000001',${hash},${sql.json(refs)}::jsonb)`,
  )
  await role("anon")
  let assetPath, assetId
  for (const ref of refs) {
    const rows = await read(ref)
    assert.ok(rows.assets.length)
    assert.ok(!JSON.stringify(rows).includes("execution_token"))
    assert.ok(!JSON.stringify(rows).includes("provider_request_id"))
    assert.ok(!JSON.stringify(rows).includes("lease_id"))
    passed++
    if (ref.execution_source === "native") {
      assetId = rows.native.asset_id
      assetPath = rows.assets.find((a) => a.id === assetId).storage_path
    }
  }
  await denied(() => read(refs[0], "sp1." + "x".repeat(43)))
  await denied(() =>
    read({ ...refs[0], generation_id: "10000000-0000-4000-8000-000000000001" }),
  )
  await denied(() => read({ ...refs[0], execution_source: "provider" }))
  await denied(() => sql`select * from public.native_generations limit 1`)
  await denied(() => sql`select * from public.credit_accounts limit 1`)
  await denied(
    () =>
      sql`select public.start_image_generation(${refs[1].generation_id}::uuid)`,
  )
  await denied(
    () =>
      sql`select public.create_saved_preview(${workspace}::uuid,${hash},${sql.json(refs)}::jsonb)`,
  )
  await sql`select set_config('request.headers',${JSON.stringify({ "x-creativeotter-preview": secret })},true)`
  const allowed =
    await sql`select name from storage.objects where bucket_id='creativeotter-media' and name=${assetPath}`
  assert.equal(allowed.length, 1)
  passed++
  assert.equal(
    (
      await sql`select public.can_read_saved_preview_object('unrelated/private-image.png') as allowed`
    )[0].allowed,
    false,
  )
  passed++
  await sql`select set_config('request.headers','{}',true)`
  assert.equal(
    (
      await sql`select name from storage.objects where bucket_id='creativeotter-media'`
    ).length,
    0,
  )
  passed++
  await deniedChange(
    () =>
      sql`update public.client_grants set revoked_at=now() where id=${grant.id}`,
  )
  await deniedChange(
    () =>
      sql`update public.client_grants set permissions=array['account:read'] where id=${grant.id}`,
  )
  await deniedChange(
    () =>
      sql`update public.client_grants set client_name=client_name||' test-version' where id=${grant.id}`,
  )
  await deniedChange(
    () =>
      sql`delete from public.workspace_members where workspace_id=${workspace} and user_id=${grant.user_id}`,
  )
  await deniedChange(
    () =>
      sql`update private.workspace_generation_limits set enabled=false where workspace_id=${workspace}`,
  )
  await deniedChange(
    () =>
      sql`update auth.users set banned_until=now()+interval '1 day' where id=${grant.user_id}`,
  )
  await deniedChange(
    () =>
      sql`update public.media_assets set status='rejected' where id=${assetId}`,
  )
  await deniedChange(
    () => sql`delete from private.saved_preview_grants where id=${created.id}`,
  )
  await reset()
  const [writes] =
    await sql`select count(*)::int as count from pg_policies where policyname='saved_preview_object_read' and cmd<>'SELECT'`
  assert.equal(writes.count, 0)
  passed++
  process.stdout.write(
    JSON.stringify({
      passed,
      existing_images: refs.length,
      new_images: 0,
      credit_mutations: 0,
      rollback: true,
    }) + "\n",
  )
} finally {
  await sql.unsafe("rollback").catch(() => {})
  await sql.end({ timeout: 1 })
}
