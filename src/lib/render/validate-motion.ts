import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { RenderInput } from "@/lib/render/contracts"
const run = promisify(execFile)
export const validateMotionOutput = async (
  bytes: Buffer,
  input: RenderInput,
) => {
  const directory = await mkdtemp(join(tmpdir(), "otter-mp4-check-"))
  try {
    const path = join(directory, "output.mp4")
    await writeFile(path, bytes)
    const { stdout } = await run(
      process.env.CREATIVEOTTER_FFPROBE_PATH || "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        path,
      ],
      { timeout: 10000, maxBuffer: 1000000 },
    )
    const data = JSON.parse(stdout) as {
      format: { duration: string }
      streams: {
        codec_type: string
        codec_name: string
        width?: number
        height?: number
        avg_frame_rate?: string
        nb_frames?: string
      }[]
    }
    const video = data.streams.find((stream) => stream.codec_type === "video")
    const [n, d] = (video?.avg_frame_rate || "0/1").split("/").map(Number)
    if (
      !video ||
      video.codec_name !== "h264" ||
      video.width !== input.width ||
      video.height !== input.height ||
      Math.abs(n / d - input.fps) > 0.01 ||
      Number(video.nb_frames) !== input.duration_seconds * input.fps ||
      Math.abs(Number(data.format.duration) - input.duration_seconds) > 0.1
    )
      throw new Error(
        "Rendered motion does not match the requested output settings.",
      )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
