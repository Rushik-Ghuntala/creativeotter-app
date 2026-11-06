import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { chromium } from "playwright"
import { createClient } from "@supabase/supabase-js"
import { creditSummarySchema } from "../src/lib/credits/contracts"
const main = async () => {
  const fixture = JSON.parse(
    await readFile("/tmp/creativeotter-render-qa.json", "utf8"),
  )
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  })
  await context.addCookies(
    fixture.cookies.map((item: { name: string; value: string }) => ({
      ...item,
      domain: "localhost",
      path: "/",
      sameSite: "Lax" as const,
    })),
  )
  const page = await context.newPage()
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    await page.clock.install()
    const response = await page.goto("http://localhost:3001/studio/designs")
    assert.equal(response?.status(), 200)
    await page
      .getByRole("heading", { name: "Designs that move you." })
      .waitFor()
    for (const item of fixture.results) {
      await page
        .getByRole("button", {
          name: `${item.title} · ${item.format === "png" ? "Image" : "Motion graphic"}`,
          exact: true,
        })
        .click()
      await page
        .getByRole("heading", { name: "Your design is ready" })
        .waitFor()
      const panel = page.getByRole("region", {
        name: "CreativeOtter design preview",
      })
      await panel.getByText("✓ Saved privately in CreativeOtter").waitFor()
      if (item.format === "png")
        await page.waitForFunction(() => {
          const image = document.querySelector(
            ".otter-render-canvas img",
          ) as HTMLImageElement
          return image?.complete && image.naturalWidth === 640
        })
      else {
        await page.waitForFunction(() => {
          const video = document.querySelector("video") as HTMLVideoElement
          return video?.readyState >= 1
        })
        await page
          .locator("video")
          .evaluate((element: HTMLVideoElement) => element.play())
        await page.waitForFunction(
          () =>
            (document.querySelector("video") as HTMLVideoElement).currentTime >
            0.1,
        )
      }
      await page.screenshot({
        path: `output/render-tests/web-${item.format}.png`,
        fullPage: true,
      })
      const downloaded = page.waitForEvent("download")
      await panel.getByRole("button", { name: "Download", exact: true }).click()
      const download = await downloaded
      assert.equal(await download.failure(), null)
      const path = `output/render-tests/browser-download.${item.format}`
      await download.saveAs(path)
      assert.equal(
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
        item.sha256,
      )
      process.stdout.write(
        `Passed browser ${item.format}: branded preview, ${item.format === "mp4" ? "video playback, " : ""}saved badge and actual download.\n`,
      )
    }
    const api = `/api/render?id=${fixture.results[1].id}`
    const refreshed = page.waitForResponse(
      (response) => response.url().endsWith(api) && response.status() === 200,
    )
    await page.clock.fastForward(25 * 60 * 1000 + 500)
    await refreshed
    await page.clock.pauseAt(new Date(Date.now() + 26 * 60 * 1000))
    // Simulate an expired signed image URL. The image error must automatically
    // obtain a fresh authorized snapshot, without a manual reopen or generation.
    let stale = true
    await page.route("**/api/render?id=*", async (route) => {
      if (!stale) {
        await route.continue()
        return
      }
      stale = false
      const response = await route.fetch()
      const data = await response.json()
      if (data.preview_url) {
        const url = new URL(data.preview_url)
        url.searchParams.set("token", "expired-test-link")
        data.preview_url = url.href
      }
      await route.fulfill({ response, json: data })
    })
    await page
      .getByRole("button", {
        name: `${fixture.results[0].title} · Image`,
        exact: true,
      })
      .click()
    await page.waitForFunction(() => {
      const image = document.querySelector(
        ".otter-render-canvas img",
      ) as HTMLImageElement
      return (
        image?.complete &&
        image.naturalWidth === 640 &&
        !image.src.includes("expired-test-link")
      )
    })
    let webCreation: Record<string, unknown> = {}
    if (process.argv.includes("--create")) {
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const user = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
      assert.equal(
        (
          await user.auth.signInWithPassword({
            email: fixture.email,
            password: fixture.password,
          })
        ).error,
        null,
      )
      const credits = async () =>
        creditSummarySchema.parse(
          (
            await user.rpc("get_credit_summary", {
              target_workspace: fixture.workspace,
            })
          ).data,
        )
      const before = await credits()
      assert.equal((await admin.rpc("render_worker_heartbeat")).error, null)
      await page.clock.resume()
      await page.unroute("**/api/render?id=*")
      await page.reload()
      const title = "A fresh start, every morning."
      await page.getByLabel("Your headline", { exact: true }).fill(title)
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
      fixture.objects.push(`${fixture.workspace}/${pending.render_id}.png`)
      await writeFile(
        "/tmp/creativeotter-render-qa.json",
        JSON.stringify(fixture),
        { mode: 0o600 },
      )
      const { runOneRender } = await import("../src/lib/render/worker")
      const finished = await runOneRender()
      assert.equal(finished?.id, pending.render_id)
      assert.equal(finished?.state, "succeeded")
      await page
        .getByRole("heading", { name: "Your design is ready" })
        .waitFor()
      await page
        .getByRole("button", { name: `${title} · Image`, exact: true })
        .waitFor()
      assert.equal(
        BigInt(before.available_units) -
          BigInt((await credits()).available_units),
        BigInt(16000),
      )
      assert.equal((await credits()).reserved_units, "0")
      const downloaded = page.waitForEvent("download")
      await page
        .getByRole("region", { name: "CreativeOtter design preview" })
        .getByRole("button", { name: "Download", exact: true })
        .click()
      const file = await downloaded
      await file.saveAs("output/render-tests/web-created.png")
      assert.equal(await file.failure(), null)
      assert.equal(
        createHash("sha256")
          .update(await readFile("output/render-tests/web-created.png"))
          .digest("hex"),
        finished!.sha256,
      )
      await page.screenshot({
        path: "output/render-tests/web-created-studio.png",
        fullPage: true,
      })
      webCreation = {
        web_create_verified: true,
        web_create_credits: 16,
        immediate_saved_list: true,
        before_web_credits: Number(before.available_units) / 1000,
        after_web_credits: Number((await credits()).available_units) / 1000,
      }
      process.stdout.write(
        "Passed ordinary Studio creation: 16 credits once, automatic ready preview, immediate saved list and matching download.\n",
      )
    }
    assert.equal(errors.length, 0, errors.join("\n"))
    await writeFile(
      "output/render-tests/browser-report.json",
      JSON.stringify(
        {
          success: true,
          png_preview: true,
          mp4_playback: true,
          downloads_hash_matched: true,
          automatic_timer_refresh: true,
          expired_url_recovered_without_reopening: true,
          browser_errors: errors,
          ...webCreation,
        },
        null,
        2,
      ),
    )
    process.stdout.write(
      "Passed scheduled automatic refresh and expired-link recovery without additional charges.\n",
    )
  } finally {
    await browser.close()
  }
}
void main().catch((error) => {
  process.stderr.write(`Browser render test failed: ${error.message}\n`)
  process.exitCode = 1
})
