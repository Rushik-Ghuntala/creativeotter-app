import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile, writeFile, unlink } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { beginMediaUpload, finishMediaUpload } from "../src/lib/media/assets.ts"
import {
  saveStudioRecord,
  saveStoryboardShot,
} from "../src/lib/studio/service.ts"
const statePath = "/tmp/creativeotter-local-qa.json"
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)
const main = async () => {
  if (process.argv[2] === "cleanup") {
    const state = JSON.parse(await readFile(statePath, "utf8"))
    assert.match(state.email, /^creativeotter-local-[0-9a-f-]+@example\.com$/)
    const fixture = await admin.auth.admin.getUserById(state.user_id)
    assert.equal(
      fixture.data.user?.email,
      state.email,
      "Refuse cleanup of a non-fixture user",
    )
    const owned = await admin
      .from("workspaces")
      .select("personal_owner_id")
      .eq("id", state.workspace_id)
      .single()
    assert.equal(
      owned.data?.personal_owner_id,
      state.user_id,
      "Refuse cleanup of an unrelated workspace",
    )
    // Explicitly remove only this fixture's reference-bearing records. Production
    // account deletion and retention behavior are deliberately unchanged.
    for (const table of [
      "studio_characters",
      "brand_kits",
      "studio_projects",
      "studio_voice_presets",
    ]) {
      assert.equal(
        (
          await admin
            .from(table)
            .delete()
            .eq("workspace_id", state.workspace_id)
        ).error,
        null,
      )
    }

    if (state.storage_paths.length)
      assert.equal(
        (
          await admin.storage
            .from("creativeotter-media")
            .remove(state.storage_paths)
        ).error,
        null,
      )
    assert.equal(
      (
        await admin
          .from("workspace_invites")
          .delete()
          .eq("created_by", state.user_id)
      ).error,
      null,
    )
    assert.equal(
      (
        await admin
          .from("support_requests")
          .delete()
          .eq("user_id", state.user_id)
      ).error,
      null,
    )
    assert.equal((await admin.auth.admin.deleteUser(state.user_id)).error, null)
    await unlink(statePath)
    process.stdout.write(
      "Removed disposable local QA user, workspace, records and media.\n",
    )
    return
  }
  // Refuse to orphan an earlier fixture or overwrite an operator credential file.
  try {
    await readFile(statePath)
    throw new Error("An existing QA fixture must be cleaned up first")
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  const email = `creativeotter-local-${randomUUID()}@example.com`,
    password = `${randomUUID()}!Aa9`
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "CreativeOtter Local QA" },
  })
  assert.equal(created.error, null)
  const state = {
    email,
    password,
    user_id: created.data.user.id,
    storage_paths: [],
    workspace_id: null,
  }
  await writeFile(statePath, JSON.stringify(state), { mode: 0o600 })
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  assert.equal(
    (await client.auth.signInWithPassword({ email, password })).error,
    null,
  )
  const ws = await client.rpc("ensure_personal_workspace")
  assert.equal(ws.error, null)
  state.workspace_id = ws.data.id
  const prepared = await beginMediaUpload(
    client,
    state.workspace_id,
    "CreativeOtter reference",
    "image/png",
  )
  state.storage_paths.push(prepared.path)
  await writeFile(statePath, JSON.stringify(state), { mode: 0o600 })
  const bytes = await readFile("public/creativeotter.png")
  const uploaded = await fetch(prepared.signed_url, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: bytes,
  })
  assert.ok(uploaded.ok)
  const asset = await finishMediaUpload(
    client,
    state.workspace_id,
    prepared.asset_id,
  )
  await saveStudioRecord(client, state.workspace_id, "brands", {
    name: "CreativeOtter",
    description: "A warm, curious and quietly confident creative studio.",
    colors: ["#193E32", "#BF774A", "#FAF9F5"],
    font_family: "Geist",
    tone: "Clear, thoughtful and friendly",
    logo_asset_id: asset.id,
  })
  await saveStudioRecord(client, state.workspace_id, "characters", {
    name: "Oliver",
    description: "A curious otter with a paintbrush and a big imagination.",
    appearance:
      "Soft brown fur, a cream muzzle and a friendly expression. Keep the same playful proportions.",
    identity_type: "fictional",
    reference_asset_id: asset.id,
  })
  const film = await saveStudioRecord(client, state.workspace_id, "films", {
    name: "A little imagination",
    description:
      "A four-shot story about turning a small spark into something worth sharing.",
    kind: "film",
    budget_target_units: "64000",
    status: "draft",
    aspect_ratio: "9:16",
  })
  for (const [i, prompt] of [
    "A quiet desk and one small spark of an idea.",
    "Oliver sketches the first creative direction.",
    "The idea grows into a colorful campaign.",
    "End card: Make something worth sharing.",
  ].entries())
    await saveStoryboardShot(client, state.workspace_id, {
      project_id: film.id,
      position: i + 1,
      prompt,
      narration: "",
      duration_seconds: 5,
    })
  await saveStudioRecord(client, state.workspace_id, "projects", {
    name: "The next launch",
    description:
      "Campaign ideas, approved references and original costs, together.",
    kind: "campaign",
    budget_target_units: "160000",
    status: "active",
  })
  await saveStudioRecord(client, state.workspace_id, "voices", {
    name: "Studio narrator",
    description: "A warm, relaxed product storyteller.",
    language: "en-US",
    style: "Natural, conversational and unhurried.",
    script:
      "A little imagination. A world of possibility. Welcome to CreativeOtter.",
  })
  await saveStudioRecord(client, state.workspace_id, "music", {
    name: "A bright beginning",
    description:
      "An optimistic instrumental direction for a product introduction.",
    kind: "music",
    genre: "Cinematic / warm electronic",
    lyrics:
      "Instrumental. A light piano motif, gentle percussion and a confident, uplifting ending.",
  })
  process.stdout.write(
    "Created disposable local browser QA workspace with one validated reference, brand kit, character, film storyboard, voice preset, music brief and campaign. Credentials are stored privately in /tmp; no credits or inference were used.\n",
  )
}
main().catch((error) => {
  process.stderr.write(`${error.name}: ${error.message}\n`)
  process.exitCode = 1
})
