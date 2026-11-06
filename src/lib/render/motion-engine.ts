import { chromium } from "playwright"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, relative, resolve, extname } from "node:path"
import { once } from "node:events"
import { spawn } from "node:child_process"
import { readProjectZip, type MotionSettings } from "@/lib/render/project"
const run = promisify(execFile)
const origin = "https://creativeotter-render.invalid"
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
}
const csp =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'self'; connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
export const renderMotionProject = async (
  zip: Uint8Array,
  settings: MotionSettings,
  inspect?: (frame: number, png: Buffer) => Promise<void>,
) => {
  const files = readProjectZip(zip)
  const directory = await mkdtemp(join(tmpdir(), "creativeotter-motion-"))
  const sourceDir = join(directory, "project")
  await mkdir(sourceDir)
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  let encoder: ReturnType<typeof spawn> | undefined
  const deadline = setTimeout(() => {
    void browser?.close()
    encoder?.kill("SIGKILL")
  }, 230000)
  try {
    for (const [name, bytes] of Object.entries(files)) {
      const path = join(sourceDir, name)
      await mkdir(join(path, ".."), { recursive: true })
      await writeFile(path, bytes)
    }
    const { bundleToSingleHtml } = await import("@hyperframes/core/compiler")
    let markup = await bundleToSingleHtml(sourceDir, {
      inlineAssets: false,
      onRead: (path) => {
        const rel = relative(sourceDir, resolve(path))
        if (rel === ".." || rel.startsWith("../") || rel.startsWith("/"))
          throw new Error(
            "A composition references a file outside its project.",
          )
      },
    })
    // Pin runtime dependencies locally. Unknown remote scripts never reach the network.
    markup = markup.replaceAll(
      "https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js",
      `${origin}/__vendor/gsap.min.js`,
    )
    const gsap = await readFile(
      join(process.cwd(), "node_modules/gsap/dist/gsap.min.js"),
    )
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      args: [
        "--disable-background-networking",
        "--disable-sync",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      ],
    })
    const context = await browser.newContext({
      viewport: { width: settings.width, height: settings.height },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
      acceptDownloads: false,
      permissions: [],
    })
    await context.routeWebSocket("**/*", (socket) => socket.close())
    let initialNavigation = true
    const rejected = new Set<string>()
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url())
      if (url.origin !== origin) {
        rejected.add(url.origin)
        return route.abort()
      }
      if (request.isNavigationRequest()) {
        if (!initialNavigation || url.pathname !== "/index.html")
          return route.abort()
        initialNavigation = false
      }
      const name = decodeURIComponent(url.pathname).slice(1)
      if (name === "index.html")
        return route.fulfill({
          contentType: "text/html",
          body: markup,
          headers: { "Content-Security-Policy": csp },
        })
      if (name === "__vendor/gsap.min.js")
        return route.fulfill({ contentType: "text/javascript", body: gsap })
      if (Object.hasOwn(files, name))
        return route.fulfill({
          contentType:
            mime[extname(name).toLowerCase()] || "application/octet-stream",
          body: Buffer.from(files[name]),
        })
      rejected.add(name)
      return route.abort()
    })
    const page = await context.newPage()
    context.on("page", (popup) => {
      if (popup !== page) void popup.close()
    })
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text().slice(0, 200))
    })
    page.setDefaultTimeout(10000)
    await page.goto(`${origin}/index.html`, {
      waitUntil: "networkidle",
      timeout: 15000,
    })
    // The core runtime exposes __player.renderSeek; __hf.seek is a producer bridge.
    await page.waitForFunction(
      "window.__renderReady === true && typeof window.__player?.renderSeek === 'function'",
      { timeout: 10000 },
    )
    const media = await page.evaluate(async (expected) => {
      const runtime = window as unknown as {
        __player: {
          enableRenderMode: () => void
          renderSeek: (t: number) => void
          getDuration: () => number
        }
        __hfResolveMediaStartSeconds?: (el: Element) => number
      }
      await document.fonts.ready
      await Promise.all([...document.images].map((image) => image.decode()))
      const root = document.querySelector<HTMLElement>("[data-composition-id]")
      if (
        !root ||
        Number(root.dataset.width) !== expected.width ||
        Number(root.dataset.height) !== expected.height ||
        Math.abs(runtime.__player.getDuration() - expected.duration_seconds) >
          0.04
      )
        throw new Error(
          "Project size or duration does not match its render settings.",
        )
      runtime.__player.enableRenderMode()
      runtime.__player.renderSeek(0)
      return [
        ...document.querySelectorAll<HTMLMediaElement>("audio,video"),
      ].map((el) => {
        if (
          !el.id ||
          !el.hasAttribute("data-duration") ||
          el.hasAttribute("data-automation") ||
          el.hasAttribute("data-speed") ||
          el.hasAttribute("data-speed-ramp")
        )
          throw new Error(
            "Use named media clips with fixed duration, playback rate and volume.",
          )
        return {
          id: el.id,
          src: el.currentSrc || el.src,
          start:
            runtime.__hfResolveMediaStartSeconds?.(el) ??
            Number(el.dataset.start || 0),
          duration: Number(el.dataset.duration),
          trim: Number(el.dataset.mediaStart || 0),
          rate: Number(el.dataset.playbackRate || 1),
          volume: el.muted ? 0 : Number(el.dataset.volume ?? 1),
          loop: el.loop,
          audio: el.tagName === "AUDIO" || el.dataset.hasAudio === "true",
        }
      })
    }, settings)
    if (media.length > 8)
      throw new Error("Use up to eight media tracks in one motion project.")
    const audio: typeof media = []
    for (const item of media) {
      const url = new URL(item.src)
      const name = decodeURIComponent(url.pathname).slice(1)
      if (
        url.origin !== origin ||
        !files[name] ||
        ![item.start, item.duration, item.trim, item.rate, item.volume].every(
          Number.isFinite,
        ) ||
        item.start < 0 ||
        item.duration <= 0 ||
        item.trim < 0 ||
        item.rate < 0.5 ||
        item.rate > 2 ||
        item.volume < 0 ||
        item.volume > 2
      )
        throw new Error("A bundled media clip has invalid settings.")
      item.src = join(sourceDir, name)
      if (item.audio && item.volume > 0) audio.push(item)
    }
    const video = join(directory, "silent.mp4")
    encoder = spawn(
      process.env.CREATIVEOTTER_FFMPEG_PATH || "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "image2pipe",
        "-framerate",
        String(settings.fps),
        "-i",
        "pipe:0",
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
        video,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    )
    let encodingError = ""
    encoder.stderr?.on("data", (chunk) => {
      encodingError = (encodingError + chunk.toString()).slice(-1000)
    })
    encoder.stdin!.on("error", () => {})
    const encoded = new Promise<void>((resolve, reject) => {
      encoder!.on("error", reject)
      encoder!.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error("Motion encoding failed: " + encodingError)),
      )
    })
    // Attach immediately so an early FFmpeg failure cannot become unhandled.
    void encoded.catch(() => {})
    const frames = settings.duration_seconds * settings.fps
    for (let frame = 0; frame < frames; frame++) {
      await page.evaluate(async (time) => {
        const runtime = window as unknown as {
          __player: { renderSeek: (t: number) => void }
          __hfWaitForSeekCompletion?: () => Promise<void>
        }
        runtime.__player.renderSeek(time)
        await runtime.__hfWaitForSeekCompletion?.()
        await Promise.all(
          [...document.querySelectorAll<HTMLVideoElement>("video")]
            .filter((v) => v.seeking)
            .map(
              (video) =>
                new Promise<void>((resolve, reject) => {
                  const timer = setTimeout(
                    () => reject(new Error("Video frame did not load")),
                    3000,
                  )
                  video.addEventListener(
                    "seeked",
                    () => {
                      clearTimeout(timer)
                      resolve()
                    },
                    { once: true },
                  )
                }),
            ),
        )
      }, frame / settings.fps)
      const png = await page.screenshot({ type: "png", timeout: 10000 })
      if (
        inspect &&
        [
          0,
          Math.floor(frames * 0.25),
          Math.floor(frames * 0.6),
          frames - 1,
        ].includes(frame)
      )
        await inspect(frame, png)
      if (!encoder.stdin!.write(png)) await once(encoder.stdin!, "drain")
    }
    encoder.stdin!.end()
    await encoded
    if (errors.length || rejected.size)
      throw new Error(
        "A project script or bundled resource could not load. Include all files in the ZIP and use the supported GSAP version.",
      )
    let output = video
    if (audio.length) {
      output = join(directory, "output.mp4")
      const args = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        video,
      ]
      for (const clip of audio)
        args.push(
          ...(clip.loop ? ["-stream_loop", "-1"] : []),
          "-protocol_whitelist",
          "file,pipe",
          "-f",
          (
            {
              ".mp4": "mov",
              ".m4a": "mov",
              ".webm": "matroska",
              ".wav": "wav",
              ".mp3": "mp3",
              ".ogg": "ogg",
            } as Record<string, string>
          )[extname(clip.src).toLowerCase()] || "unsupported",
          "-i",
          clip.src,
        )
      const filters = audio.map(
        (clip, i) =>
          `[${i + 1}:a]atrim=start=${clip.trim}:duration=${clip.duration * clip.rate},asetpts=PTS-STARTPTS,atempo=${clip.rate},volume=${clip.volume},atrim=duration=${clip.duration},adelay=${Math.round(clip.start * 1000)}:all=1[a${i}]`,
      )
      filters.push(
        `${audio.map((_, i) => `[a${i}]`).join("")}amix=inputs=${audio.length}:normalize=0,alimiter=limit=0.95,apad,atrim=duration=${settings.duration_seconds}[audio]`,
      )
      args.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "0:v:0",
        "-map",
        "[audio]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-t",
        String(settings.duration_seconds),
        "-movflags",
        "+faststart",
        output,
      )
      await run(process.env.CREATIVEOTTER_FFMPEG_PATH || "ffmpeg", args, {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      })
    }
    const bytes = await readFile(output)
    if (bytes.length > 30 * 1024 * 1024)
      throw new Error("This motion video is larger than 30 MB.")
    return bytes
  } finally {
    clearTimeout(deadline)
    encoder?.kill("SIGKILL")
    await browser?.close()
    await rm(directory, { recursive: true, force: true })
  }
}
