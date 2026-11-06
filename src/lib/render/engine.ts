import { chromium } from "playwright"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { renderDocument } from "@/lib/render/sanitize"
import type { RenderInput } from "@/lib/render/contracts"
const run = promisify(execFile)

export const renderComposition = async (
  input: RenderInput,
  images: Record<string, string> = {},
) => {
  const markup = renderDocument(input, images)
  const directory = await mkdtemp(join(tmpdir(), "creativeotter-render-"))
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true })
    deadline = setTimeout(() => {
      void browser?.close()
    }, 110000)
    const context = await browser.newContext({
      viewport: { width: input.width, height: input.height },
      deviceScaleFactor: 1,
      javaScriptEnabled: false,
      serviceWorkers: "block",
      acceptDownloads: false,
      permissions: [],
    })
    await context.route("**/*", (route) => route.abort())
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    await page.setContent(markup, { waitUntil: "load", timeout: 10000 })
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(
        Array.from(document.images).map((image) => image.decode()),
      )
      for (const animation of document.getAnimations()) {
        animation.pause()
        animation.currentTime = 0
      }
    })
    const frames =
      input.format === "png" ? 1 : input.duration_seconds * input.fps
    for (let i = 0; i < frames; i++) {
      await page.evaluate(
        (time) => {
          for (const animation of document.getAnimations()) {
            animation.pause()
            animation.currentTime = time
          }
        },
        (i * 1000) / input.fps,
      )
      await writeFile(
        join(directory, `frame-${String(i).padStart(4, "0")}.png`),
        await page.screenshot({ type: "png", timeout: 10000 }),
      )
    }
    if (input.format === "png")
      return await readFile(join(directory, "frame-0000.png"))
    const output = join(directory, "output.mp4")
    await run(
      process.env.CREATIVEOTTER_FFMPEG_PATH || "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-framerate",
        String(input.fps),
        "-i",
        join(directory, "frame-%04d.png"),
        "-an",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "20",
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024 },
    )
    const bytes = await readFile(output)
    if (bytes.length > 30 * 1024 * 1024)
      throw new Error("The rendered file is too large.")
    return bytes
  } finally {
    if (deadline) clearTimeout(deadline)
    await browser?.close()
    await rm(directory, { recursive: true, force: true })
  }
}
