import { createAdminSupabase } from "../src/lib/supabase"
import { runOneRender } from "../src/lib/render/worker"
import { renderingEnabled } from "../src/lib/render/contracts"
const main = async () => {
  if (!renderingEnabled())
    throw new Error(
      "Set CREATIVEOTTER_RENDERING_ENABLED=true in the dedicated worker environment",
    )
  const admin = createAdminSupabase()
  const heartbeat = async () => {
    const result = await admin.rpc("render_worker_heartbeat")
    if (result.error) throw new Error("Render heartbeat failed")
  }
  await heartbeat()
  let stopping = false
  process.on("SIGINT", () => {
    stopping = true
  })
  process.on("SIGTERM", () => {
    stopping = true
  })
  const timer = setInterval(() => {
    void heartbeat().catch(() => {
      process.stderr.write("Worker heartbeat unavailable\n")
    })
  }, 10000)
  process.stdout.write(
    "CreativeOtter local render worker ready. No fal.ai calls.\n",
  )
  try {
    while (!stopping) {
      try {
        const job = await runOneRender()
        if (job) process.stdout.write(`Render ${job.state}\n`)
        else await new Promise((resolve) => setTimeout(resolve, 1500))
      } catch {
        process.stderr.write("Render processing will retry safely.\n")
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }
  } finally {
    clearInterval(timer)
  }
}
void main().catch(() => {
  process.stderr.write("Render command failed\n")
  process.exitCode = 1
})
