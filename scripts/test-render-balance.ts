import assert from "node:assert/strict"
import { randomUUID, createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { chromium } from "playwright"
import { createDatabaseConnection } from "./database.mjs"
import { runOneRender } from "../src/lib/render/worker"
import type { Database } from "../src/lib/database.types"
const main = async () => {
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const jar = new Map<string, string>()
  const user = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
        setAll: (values) =>
          values.forEach(({ name, value }) => jar.set(name, value)),
      },
    },
  )
  const sql = createDatabaseConnection()
  let userId: string | undefined, path: string | undefined
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  })
  try {
    const email = `render-test-balance-${randomUUID()}@example.com`,
      password = `Aa!${randomUUID()}`
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    assert.equal(created.error, null)
    userId = created.data.user!.id
    assert.equal(
      (await user.auth.signInWithPassword({ email, password })).error,
      null,
    )
    const workspace = await user.rpc("ensure_personal_workspace")
    assert.equal(workspace.error, null)
    const ws = workspace.data!.id
    await sql`insert into private.workspace_render_settings(workspace_id,enabled,png_credit_units,mp4_credit_units,pricing_version,valid_until) values(${ws},true,16000,16000,'local-balance-ui-test',now()+interval '1 hour')`
    assert.equal(
      (
        await admin.rpc("record_credit_grant", {
          target_workspace: ws,
          units: "100000",
          external_event_id: `render-balance:${randomUUID()}`,
          reason: "Disposable UI wallet refresh test",
        })
      ).error,
      null,
    )
    assert.equal((await admin.rpc("render_worker_heartbeat")).error, null)
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      acceptDownloads: true,
    })
    await context.addCookies(
      Array.from(jar, ([name, value]) => ({
        name,
        value,
        domain: "localhost",
        path: "/",
        sameSite: "Lax" as const,
      })),
    )
    const page = await context.newPage()
    await page.goto("http://localhost:3001/studio/designs")
    await page
      .getByRole("link", { name: "100 available credits", exact: true })
      .waitFor()
    await page
      .getByLabel("Your headline", { exact: true })
      .fill("Ideas worth sharing.")
    const posted = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/render") &&
        response.request().method() === "POST",
    )
    await page
      .getByRole("button", { name: "Create · 16 credits", exact: true })
      .click()
    const response = await posted
    assert.equal(response.status(), 200)
    const pending = await response.json()
    path = `${ws}/${pending.render_id}.png`
    await page
      .getByRole("link", { name: "84 available credits", exact: true })
      .waitFor()
    const job = await runOneRender()
    assert.equal(job?.id, pending.render_id)
    assert.equal(job?.state, "succeeded")
    await page
      .getByRole("heading", { name: "Your design is ready", exact: true })
      .waitFor()
    await page
      .getByRole("button", {
        name: "Ideas worth sharing. · Image",
        exact: true,
      })
      .waitFor()
    assert.equal(
      await page
        .getByRole("button", { name: "Create · 16 credits", exact: true })
        .isEnabled(),
      true,
    )
    await page
      .getByRole("link", { name: "84 available credits", exact: true })
      .waitFor()
    const fileEvent = page.waitForEvent("download")
    await page.getByRole("button", { name: "Download", exact: true }).click()
    const file = await fileEvent
    await file.saveAs("output/render-tests/final-studio-download.png")
    assert.equal(
      createHash("sha256")
        .update(await readFile("output/render-tests/final-studio-download.png"))
        .digest("hex"),
      job!.sha256,
    )
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: "output/render-tests/final-studio.png",
      fullPage: true,
    })
    await writeFile(
      "output/render-tests/wallet-ui-report.json",
      JSON.stringify(
        {
          success: true,
          before_credits: 100,
          after_credits: 84,
          charged_credits: 16,
          sidebar_updated_without_manual_refresh: true,
          create_reenabled: true,
          saved_list_updated: true,
          download_hash_matched: true,
          customer_wallet_used: false,
        },
        null,
        2,
      ),
    )
    process.stdout.write(
      "Passed real Studio wallet refresh: 100 → 84 credits automatically, one 16-credit charge, Create re-enabled, saved list updated and download matched. Disposable account only.\n",
    )
  } finally {
    await browser.close()
    if (path) await admin.storage.from("creativeotter-renders").remove([path])
    if (userId) await admin.auth.admin.deleteUser(userId)
    await sql.end({ timeout: 1 })
  }
}
void main().catch((error) => {
  process.stderr.write(`Studio balance test failed: ${error.message}\n`)
  process.exitCode = 1
})
