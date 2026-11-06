import "server-only"
import { validateMotionOutput } from "@/lib/render/validate-motion"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { createAdminSupabase } from "@/lib/supabase"
import { RENDER_BUCKET, type RenderInput } from "@/lib/render/contracts"
import { validateRenderInput } from "@/lib/render/sanitize"
import { readMotionSource } from "@/lib/render/project-service"
import { MEDIA_BUCKET } from "@/lib/media/contracts"
import { validateImageBytes } from "@/lib/media/image-validation"

const execute = (
  input: RenderInput,
  images: Record<string, string>,
  project?: string,
) =>
  new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/render-child.ts"],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          NODE_ENV: "production",
          HYPERFRAMES_NO_TELEMETRY: "1",
          DO_NOT_TRACK: "1",
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
          CREATIVEOTTER_FFMPEG_PATH: process.env.CREATIVEOTTER_FFMPEG_PATH,
          CREATIVEOTTER_FFPROBE_PATH: process.env.CREATIVEOTTER_FFPROBE_PATH,
        },
      },
    )
    let length = 0
    const chunks: Buffer[] = []
    const stop = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL")
        } catch {}
      }
    }
    const timeout = setTimeout(() => {
      stop()
      reject(new Error("Render deadline exceeded"))
    }, 250000)
    child.stdout.on("data", (chunk: Buffer) => {
      length += chunk.length
      if (length > 31457280) {
        stop()
        reject(new Error("Render output too large"))
      } else chunks.push(chunk)
    })
    child.stderr.resume()
    child.stdin.on("error", () => {})
    child.on("error", (error) => {
      clearTimeout(timeout)
      stop()
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timeout)
      stop()
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error("The design could not be rendered"))
    })
    child.stdin.end(JSON.stringify({ input, images, project }))
  })

export const runOneRender = async () => {
  const admin = createAdminSupabase()
  const { data: job, error } = await admin.rpc("claim_render")
  if (error) throw new Error("Unable to claim a render")
  if (!job?.id || !job.lease_id) return null
  if (job.state === "failed") return job
  const path = `${job.workspace_id}/${job.id}.${job.input.format}`
  let bytes: Buffer
  try {
    // Recovery reuses the already-saved artifact; it never starts another model.
    const existing = await admin.storage.from(RENDER_BUCKET).download(path)
    if (!existing.error && existing.data)
      bytes = Buffer.from(await existing.data.arrayBuffer())
    else {
      const input = validateRenderInput(job.input)
      const images: Record<string, string> = {}
      for (const id of input.asset_ids) {
        const { data: asset } = await admin
          .from("media_assets")
          .select("*")
          .eq("id", id)
          .eq("workspace_id", job.workspace_id)
          .eq("status", "ready")
          .single()
        if (!asset || !asset.size_bytes || asset.size_bytes > 5 * 1024 * 1024)
          throw new Error("Design image unavailable")
        const file = await admin.storage
          .from(MEDIA_BUCKET)
          .download(asset.storage_path)
        if (file.error || !file.data)
          throw new Error("Design image unavailable")
        const data = Buffer.from(await file.data.arrayBuffer())
        validateImageBytes(data, asset.mime_type)
        images[id] = `data:${asset.mime_type};base64,${data.toString("base64")}`
      }
      const source =
        input.engine === "hyperframes" && input.revision_id
          ? await readMotionSource(admin, job.workspace_id, input.revision_id)
          : null
      bytes = await execute(
        input,
        images,
        source ? Buffer.from(source.zip).toString("base64") : undefined,
      )
    }
    if (!bytes.length || bytes.length > 31457280)
      throw new Error("Invalid rendered output")
    if (job.input.format === "png") {
      const dimensions = validateImageBytes(bytes, "image/png", 31457280)
      if (
        dimensions.width !== job.input.width ||
        dimensions.height !== job.input.height
      )
        throw new Error("Rendered dimensions do not match the design")
    } else await validateMotionOutput(bytes, job.input)
  } catch {
    const result = await admin.rpc("fail_render", {
      target_render: job.id,
      lease: job.lease_id,
    })
    if (result.error) throw new Error("Render failure requires reconciliation")
    return result.data
  }
  // Storage/finalization failures retain the reservation. A later claim reuses
  // the saved object. Never release a successful render because a DB call timed out.
  const upload = await admin.storage.from(RENDER_BUCKET).upload(path, bytes, {
    contentType: job.input.format === "png" ? "image/png" : "video/mp4",
    upsert: false,
  })
  if (
    upload.error &&
    !["409", "Duplicate"].includes(upload.error.statusCode || "")
  )
    throw new Error("Saving will retry after the render lease expires")
  const completed = await admin.rpc("complete_render", {
    target_render: job.id,
    lease: job.lease_id,
    bytes: bytes.length,
    digest: createHash("sha256").update(bytes).digest("hex"),
  })
  if (completed.error)
    throw new Error("Finalizing will retry using the saved design")
  return completed.data
}
