import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { chromium } from "playwright"
const main = async () => {
  const fixture = JSON.parse(
    await readFile("/tmp/creativeotter-spaceoffice-motion-qa.json", "utf8"),
  )
  const output =
    "/Users/rushikghuntala/Documents/ChatGPT/Creative Claw/output/spaceoffice-motion-30s"
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  })
  try {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1100 },
      baseURL: "http://localhost:3001",
      acceptDownloads: true,
    })
    await context.addCookies(
      fixture.cookies.map((c: { name: string; value: string }) => ({
        ...c,
        domain: "localhost",
        path: "/",
        sameSite: "Lax",
      })),
    )
    const page = await context.newPage(),
      errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto(`/studio/designs?project=${fixture.revision_id}`, {
      waitUntil: "networkidle",
    })
    await page
      .getByRole("button", {
        name: "SpaceOffice — One brief. Your AI team. · Motion graphic",
        exact: true,
      })
      .click()
    const video = page.locator(".otter-render-panel video")
    await video.waitFor()
    await page.waitForFunction(
      () => {
        const video = document.querySelector("video")
        return video && Number.isFinite(video.duration) && video.readyState >= 2
      },
      null,
      { timeout: 15000 },
    )
    const duration = await video.evaluate(
      (el) => (el as HTMLVideoElement).duration,
    )
    assert.ok(Math.abs(duration - 30) < 0.05)
    await video.evaluate(async (el) => {
      const v = el as HTMLVideoElement
      v.muted = true
      await v.play()
    })
    await page.waitForFunction(
      () => document.querySelector("video")!.currentTime > 0.3,
    )
    await video.evaluate(async (el) => {
      const v = el as HTMLVideoElement
      v.pause()
      await new Promise<void>((resolve) => {
        v.addEventListener("seeked", () => resolve(), { once: true })
        v.currentTime = 28
      })
    })
    await page
      .getByRole("link", { name: "84 available credits", exact: true })
      .waitFor()
    await page.screenshot({
      path: `${output}/proof/creativeotter-preview.png`,
      fullPage: true,
    })
    const awaited = page.waitForEvent("download")
    await page.getByRole("button", { name: "Download", exact: true }).click()
    const download = await awaited
    await download.saveAs(`${output}/spaceoffice-motion-30s-downloaded.mp4`)
    assert.equal(
      createHash("sha256")
        .update(
          await readFile(`${output}/spaceoffice-motion-30s-downloaded.mp4`),
        )
        .digest("hex"),
      fixture.sha256,
    )
    const awaitedZip = page.waitForEvent("download")
    await page
      .getByRole("button", { name: "Download project ZIP", exact: true })
      .click()
    await (
      await awaitedZip
    ).saveAs(`${output}/spaceoffice-motion-project-downloaded.zip`)
    assert.equal(
      createHash("sha256")
        .update(
          await readFile(`${output}/spaceoffice-motion-project-downloaded.zip`),
        )
        .digest("hex"),
      createHash("sha256")
        .update(await readFile(`${output}/spaceoffice-motion-project.zip`))
        .digest("hex"),
    )
    let failed = false,
      refreshes = 0
    page.on("request", (r) => {
      if (r.url().includes(`/api/render?id=${fixture.render_id}`)) refreshes++
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
      const v = el as HTMLVideoElement
      v.src = v.src + "&test_expired=1"
      v.load()
    })
    await page.waitForFunction(
      () => {
        const v = document.querySelector("video")
        return v && v.readyState >= 2 && !v.error
      },
      null,
      { timeout: 20000 },
    )
    assert.ok(failed && refreshes > 0)
    await page
      .getByRole("link", { name: "84 available credits", exact: true })
      .waitFor()
    assert.deepEqual(errors, [])
    await writeFile(
      `${output}/preview-verification.json`,
      JSON.stringify(
        {
          success: true,
          video_duration: duration,
          playback: true,
          seek_to_final_scene: true,
          creativeotter_branded_preview: true,
          browser_mp4_download_sha256_matches: true,
          browser_project_zip_download_sha256_matches: true,
          failed_link_automatic_recovery: true,
          credits_after_preview_and_downloads: 84,
          extra_credits_spent: 0,
          page_errors: errors,
        },
        null,
        2,
      ),
    )
    console.log(
      "Passed 30-second CreativeOtter preview playback, actual browser MP4/ZIP downloads, automatic link recovery and unchanged84-credit balance.",
    )
  } finally {
    await browser.close()
  }
}
void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
