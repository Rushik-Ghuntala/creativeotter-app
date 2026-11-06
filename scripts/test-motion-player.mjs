import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import { build } from "esbuild"
import { chromium } from "playwright"
const videoFile = process.argv[2]
const output = process.argv[3]
if (!videoFile || !output)
  throw new Error("Pass an existing local MP4 and a report directory")
const video = await readFile(videoFile)
const css = await readFile("src/styles/render.css", "utf8")
const compiled = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {RenderPanel} from '@/components/render/RenderPanel';
const media='https://media.creativeotter.invalid/video.mp4';let revision=1;window.reads=0;
const initial={render_id:'10000000-0000-4000-8000-000000000001',title:'SpaceOffice saved video',format:'mp4',state:'succeeded',credit_units:'16000',credit_status:'charged',width:1920,height:1080,duration_seconds:30,preview_url:media+'?v=1',download_url:media+'?v=1&download=spaceoffice.mp4',urls_expire_at:'2026-11-07T00:00:00Z',saved:true,message:'Your video is ready.'};
const refresh=async()=>{window.reads++;await new Promise(r=>setTimeout(r,350));if(window.failNext){window.failNext=false;throw new Error('Temporary outage')}revision++;return {...initial,preview_url:media+'?v='+revision,download_url:media+'?v='+revision+'&download=spaceoffice.mp4'}};
const bridge={getHostCapabilities:()=>({downloadFile:{}}),downloadFile:async request=>{window.downloaded=request.contents[0].uri},openLink:async()=>{throw new Error('Unexpected external link')}};
createRoot(document.getElementById('app')).render(<RenderPanel initial={initial} refresh={refresh} bridge={bridge}/>);`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
})
const server = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html")
  res.end(
    `<html><style>body{margin:32px;background:#fafbf9}#app{max-width:1000px;margin:auto}${css}</style><main id="app"></main><script>${compiled.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></html>`,
  )
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const browser = await chromium.launch({ headless: true, chromiumSandbox: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1000 },
  })
  await page.route("https://media.creativeotter.invalid/**", (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(
      route.request().headers().range || "",
    )
    const start = range ? Number(range[1]) : 0
    const end = range?.[2]
      ? Math.min(Number(range[2]), video.length - 1)
      : video.length - 1
    const body = video.subarray(start, end + 1)
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: "video/mp4",
      body,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(body.length),
        ...(range
          ? { "Content-Range": `bytes ${start}-${end}/${video.length}` }
          : {}),
      },
    })
  })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(
    () => document.querySelector("video")?.readyState >= 2,
  )
  await page.locator("video").evaluate(async (node) => {
    node.currentTime = 5
    await node.play()
  })
  await page.getByRole("button", { name: "Refresh preview" }).click()
  await page.getByRole("button", { name: "Download", exact: true }).click()
  await page.waitForFunction(() => window.downloaded)
  await page.waitForFunction(
    () => {
      const node = document.querySelector("video")
      return (
        node?.readyState >= 3 &&
        !node.seeking &&
        node.currentSrc.includes("v=2") &&
        node.currentTime >= 5 &&
        !node.paused
      )
    },
    { timeout: 10000 },
  )
  const playing = await page.locator("video").evaluate((node) => ({
    time: node.currentTime,
    paused: node.paused,
    src: node.currentSrc,
  }))
  assert.ok(playing.time >= 5 && playing.time < 9)
  assert.equal(playing.paused, false)
  assert.match(playing.src, /v=2/)
  assert.equal(await page.evaluate(() => window.reads), 1)
  assert.match(
    await page.evaluate(() => window.downloaded),
    /v=2&download=spaceoffice.mp4/,
  )
  await page.locator("video").evaluate(
    (node) =>
      new Promise((resolve) => {
        node.pause()
        node.addEventListener("seeked", resolve, { once: true })
        node.currentTime = 12
      }),
  )
  await page.waitForFunction(() => {
    const v = document.querySelector("video")
    return !v.seeking && Math.abs(v.currentTime - 12) < 0.2
  })
  console.log(
    "Paused before refresh",
    await page
      .locator("video")
      .evaluate((node) => ({ time: node.currentTime, paused: node.paused })),
  )
  await page.getByRole("button", { name: "Refresh preview" }).click()
  await page.waitForFunction(() =>
    document.querySelector("video")?.currentSrc.includes("v=3"),
  )
  console.log(
    "Paused after new URL",
    await page.locator("video").evaluate((node) => ({
      time: node.currentTime,
      paused: node.paused,
      ready: node.readyState,
    })),
  )
  await page.waitForFunction(
    () => Math.abs(document.querySelector("video").currentTime - 12) < 0.2,
  )
  assert.equal(
    await page.locator("video").evaluate((node) => node.paused),
    true,
  )
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  )
  await page.waitForFunction(() =>
    document.querySelector("video")?.currentSrc.includes("v=4"),
  )
  await page.evaluate(() => {
    window.failNext = true
  })
  await page.getByRole("button", { name: "Refresh preview" }).click()
  await page.getByRole("status").waitFor()
  await page.getByRole("button", { name: "Refresh preview" }).click()
  await page.waitForFunction(() =>
    document.querySelector("video")?.currentSrc.includes("v=5"),
  )
  assert.equal(
    await page
      .getByText("We’re reconnecting your preview.", { exact: false })
      .count(),
    0,
  )
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: `${output}/player-regression.png` })
  const result = {
    component_only: true,
    existing_video_only: true,
    no_backend_or_credit_calls: true,
    playing_position_preserved: true,
    paused_position_preserved: true,
    concurrent_refresh_download_share_one_read: true,
    automatic_visibility_refresh: true,
    temporary_outage_recovery: true,
  }
  await writeFile(
    `${output}/player-regression.json`,
    JSON.stringify(result, null, 2),
  )
  console.log(JSON.stringify(result))
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
