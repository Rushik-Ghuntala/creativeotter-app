import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { chromium } from "playwright"
const main = async () => {
  const fixture = JSON.parse(
    await readFile("/tmp/creativeotter-motion-qa.json", "utf8"),
  )
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  })
  try {
    const context = await browser.newContext({
      baseURL: "http://localhost:3001",
      viewport: { width: 1440, height: 1100 },
      acceptDownloads: true,
    })
    await context.addCookies(
      fixture.cookies.map((cookie: { name: string; value: string }) => ({
        ...cookie,
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      })),
    )
    const page = await context.newPage()
    const failures: string[] = []
    page.on("pageerror", (e) => failures.push(e.message))
    await page.goto(
      `http://localhost:3001/studio/designs?project=${fixture.revision_id}`,
      { waitUntil: "networkidle" },
    )
    await page
      .getByText("Your motion projects", { exact: true })
      .waitFor({ timeout: 30000 })
    await page
      .getByRole("button", {
        name: "Our summer sale is here · Motion graphic",
        exact: true,
      })
      .click()
    const video = page.locator(".otter-render-panel video")
    await video.waitFor({ timeout: 10000 })
    await video.evaluate(async (el) => {
      const video = el as HTMLVideoElement
      video.muted = true
      await video.play()
    })
    await page.waitForFunction(() => {
      const video = document.querySelector("video")
      return video && video.currentTime > 0.2
    })
    await video.evaluate((el) => (el as HTMLVideoElement).pause())
    await page.screenshot({
      path: "output/hyperframes-tests/studio-motion-preview.png",
      fullPage: true,
    })
    const media = page.waitForEvent("download")
    await page.getByRole("button", { name: "Download", exact: true }).click()
    const downloaded = await media
    await downloaded.saveAs("output/hyperframes-tests/browser-video.mp4")
    assert.equal(
      createHash("sha256")
        .update(await readFile("output/hyperframes-tests/browser-video.mp4"))
        .digest("hex"),
      createHash("sha256")
        .update(
          await readFile("output/hyperframes-tests/credit-tested-motion.mp4"),
        )
        .digest("hex"),
    )
    const source = page.waitForEvent("download")
    await page
      .getByRole("button", { name: "Download project ZIP", exact: true })
      .click()
    const sourceDownload = await source
    await sourceDownload.saveAs("output/hyperframes-tests/browser-project.zip")
    const sourceResponse = await page.request.get(
      `/api/motion?id=${fixture.revision_id}`,
    )
    const saved = await sourceResponse.json()
    assert.equal(
      createHash("sha256")
        .update(await readFile("output/hyperframes-tests/browser-project.zip"))
        .digest("hex"),
      saved.revision.source_sha256,
    )
    // Force one failed media fetch, then observe automatic same-render recovery.
    let failed = false,
      refreshes = 0
    page.on("request", (request) => {
      if (request.url().includes(`/api/render?id=${fixture.render_id}`))
        refreshes++
    })
    await context.route(
      "**/storage/v1/object/sign/creativeotter-renders/**",
      (route) => {
        if (!failed) {
          failed = true
          return route.abort()
        }
        return route.continue()
      },
    )
    await video.evaluate((el) => {
      const video = el as HTMLVideoElement
      video.src = video.src + "&test_expired=1"
      video.load()
    })
    await page.waitForFunction(
      () => {
        const v = document.querySelector("video")
        return v && v.readyState >= 2 && v.error === null
      },
      { timeout: 20000 },
    )
    assert.ok(failed)
    assert.ok(refreshes > 0)
    const walletReport = JSON.parse(
      await readFile("output/hyperframes-tests/web-create-report.json", "utf8"),
    )
    await page
      .getByRole("link", {
        name: `${walletReport.credits_after} available credits`,
        exact: true,
      })
      .waitFor({ timeout: 10000 })
    const popupPromise = context.waitForEvent("page")
    await page
      .getByRole("button", { name: "Edit project", exact: true })
      .click()
    const popup = await popupPromise
    await popup.waitForURL(
      `http://localhost:3001/studio/designs?project=${fixture.revision_id}`,
    )
    await popup
      .getByText("Your motion projects", { exact: true })
      .waitFor({ timeout: 10000 })
    await popup.close()
    // Private ZIP import uses direct storage upload and does not spend credits.
    await page
      .getByLabel("Import project ZIP")
      .setInputFiles("output/hyperframes-tests/summer-launch-project.zip")
    await page
      .getByText("Your editable project is saved. No credits spent.", {
        exact: true,
      })
      .waitFor({ timeout: 20000 })
    const list = await (await page.request.get("/api/motion")).json()
    const imported = list.projects[0]
    assert.equal(imported.title, "summer-launch-project")
    await writeFile(
      "output/hyperframes-tests/web-report.json",
      JSON.stringify(
        {
          success: true,
          existing_video_played: true,
          mp4_download_hash: true,
          source_zip_download_hash: true,
          automatic_failed_link_recovery: true,
          private_zip_import: true,
          sidebar_balance: true,
          edit_project_local: true,
          credits_spent: 0,
          page_errors: failures,
        },
        null,
        2,
      ),
    )
    assert.deepEqual(failures, [])
    console.log(
      "Passed Studio playback, actual MP4 and editable ZIP downloads, automatic link recovery and private project import. No generation or credits spent.",
    )
  } finally {
    await browser.close()
  }
}
void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
