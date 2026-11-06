import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { zipSync, strToU8 } from "fflate"
import { renderMotionProject } from "../src/lib/render/motion-engine"
import { motionTemplate } from "../src/lib/render/motion-template"
const run = promisify(execFile)
const main = async () => {
  const output = "output/hyperframes-tests"
  await mkdir(output, { recursive: true })
  await run(
    "ffmpeg",
    [
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=6",
      "-c:a",
      "pcm_s16le",
      `${output}/test-music.wav`,
    ],
    { maxBuffer: 1000000 },
  )
  await run(
    "ffmpeg",
    [
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30:duration=2",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      `${output}/test-footage.mp4`,
    ],
    { maxBuffer: 1000000 },
  )
  const html = motionTemplate(
    "Our summer collection is here.",
    "#f6b96d",
    4,
    true,
  ).replace(
    '<div class="footer">',
    '<video id="demo" src="assets/demo.mp4" muted playsinline data-start="1" data-duration="2" style="position:absolute;width:200px;height:112px;right:50px;bottom:50px"></video><div class="footer">',
  )
  const zip = zipSync({
    "index.html": strToU8(html),
    "assets/music.wav": await readFile(`${output}/test-music.wav`),
    "assets/demo.mp4": await readFile(`${output}/test-footage.mp4`),
  })
  await writeFile(`${output}/summer-launch-project.zip`, zip)
  const frames: Buffer[] = []
  const bytes = await renderMotionProject(
    zip,
    { width: 864, height: 1080, duration_seconds: 4, fps: 30 },
    async (frame, png) => {
      frames.push(png)
      await writeFile(`${output}/summer-${frame}.png`, png)
    },
  )
  assert.notDeepEqual(frames[0], frames[1])
  await writeFile(`${output}/summer-launch-with-audio.mp4`, bytes)
  const probe = JSON.parse(
    (
      await run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        `${output}/summer-launch-with-audio.mp4`,
      ])
    ).stdout,
  )
  assert.equal(
    probe.streams.find((s: { codec_type: string }) => s.codec_type === "video")
      .avg_frame_rate,
    "30/1",
  )
  assert.equal(
    probe.streams.find((s: { codec_type: string }) => s.codec_type === "audio")
      .codec_name,
    "aac",
  )
  assert.ok(Math.abs(Number(probe.format.duration) - 4) < 0.1)
  // Inspect signal, not merely the existence of an empty audio track.
  const stats = await run("ffmpeg", [
    "-hide_banner",
    "-i",
    `${output}/summer-launch-with-audio.mp4`,
    "-af",
    "volumedetect",
    "-vn",
    "-sn",
    "-f",
    "null",
    "-",
  ])
  assert.match(stats.stderr, /mean_volume: -\d+(?:\.\d+)? dB/)
  // A supplied external script must fail; no network fallback is attempted.
  await assert.rejects(() =>
    renderMotionProject(
      zipSync({
        "index.html": strToU8(
          motionTemplate("Hello", undefined, 1).replace(
            "</head>",
            '<script src="http://127.0.0.1:3000/private.js"></script></head>',
          ),
        ),
      }),
      { width: 864, height: 1080, duration_seconds: 1, fps: 12 },
    ),
  )
  console.log(
    JSON.stringify({
      audio: true,
      video: true,
      fps: 30,
      duration: 4,
      frames: 120,
      network_blocked: true,
      bytes: bytes.length,
    }),
  )
}
void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
