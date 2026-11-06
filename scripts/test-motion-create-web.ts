import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { chromium } from "playwright"
import { runOneRender } from "../src/lib/render/worker"
import type { Database } from "../src/lib/database.types"
const main = async () => {
  process.env.CREATIVEOTTER_RENDERING_ENABLED = "true"
  const fixture = JSON.parse(
    await readFile("/tmp/creativeotter-motion-qa.json", "utf8"),
  )
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const heartbeat = () => admin.rpc("render_worker_heartbeat")
  await heartbeat()
  const timer = setInterval(() => {
    void heartbeat()
  }, 10000)
  const before = (
    await admin
      .from("credit_accounts")
      .select("available_units,reserved_units")
      .eq("workspace_id", fixture.workspace)
      .single()
  ).data!
  assert.equal(before.reserved_units, 0)
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  })
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
      baseURL: "http://localhost:3001",
    })
    await context.addCookies(
      fixture.cookies.map((c: { name: string; value: string }) => ({
        ...c,
        domain: "localhost",
        path: "/",
        sameSite: "Lax",
      })),
    )
    const page = await context.newPage()
    await page.goto("/studio/designs", { waitUntil: "networkidle" })
    await page
      .getByRole("textbox", { name: "Project name / headline" })
      .fill("Weekend treats are here.")
    await page.getByLabel("Video length", { exact: true }).selectOption("4")
    const button = page.getByRole("button", {
      name: "Create video · 16 credits",
      exact: true,
    })
    await button.waitFor()
    assert.equal(await button.isEnabled(), true)
    const queued = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/render") &&
        response.request().method() === "POST",
    )
    await button.click()
    const response = await queued
    assert.equal(response.status(), 200, await response.text())
    const render = await response.json()
    assert.ok(["queued", "running"].includes(render.state))
    const reserved = (
      await admin
        .from("credit_accounts")
        .select("available_units,reserved_units")
        .eq("workspace_id", fixture.workspace)
        .single()
    ).data!
    assert.equal(reserved.available_units, before.available_units - 16000)
    assert.equal(reserved.reserved_units, 16000)
    assert.equal((await runOneRender())?.state, "succeeded")
    await page
      .getByText("Your design is ready", { exact: true })
      .waitFor({ timeout: 20000 })
    await page
      .getByText("Weekend treats are here. · Motion graphic", { exact: true })
      .waitFor({ timeout: 15000 })
    assert.equal(
      await page
        .getByRole("button", { name: "Create video · 16 credits", exact: true })
        .isEnabled(),
      true,
    )
    const final = (
      await admin
        .from("credit_accounts")
        .select("available_units,reserved_units")
        .eq("workspace_id", fixture.workspace)
        .single()
    ).data!
    assert.equal(final.available_units, before.available_units - 16000)
    assert.equal(final.reserved_units, 0)
    // Sidebar wallet refresh must show the settled balance without a full user reload.
    await page
      .getByRole("link", {
        name: `${final.available_units / 1000} available credits`,
        exact: true,
      })
      .waitFor({ timeout: 10000 })
    await page.screenshot({
      path: "output/hyperframes-tests/studio-normal-create.png",
      fullPage: true,
    })
    await writeFile(
      "output/hyperframes-tests/web-create-report.json",
      JSON.stringify(
        {
          success: true,
          headline: "Weekend treats are here.",
          credits_before: before.available_units / 1000,
          credits_after: final.available_units / 1000,
          charged: 16,
          reserved: 0,
          extra_approval: false,
          preview_and_saved_list: true,
          create_button_reenabled: true,
        },
        null,
        2,
      ),
    )
    console.log(
      "Passed everyday Studio creation: direct render, exactly 16 credits, auto-updating video, saved list and re-enabled Create button.",
    )
  } finally {
    clearInterval(timer)
    await browser.close()
  }
}
void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
