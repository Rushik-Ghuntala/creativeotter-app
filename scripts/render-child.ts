import { renderMotionProject } from "../src/lib/render/motion-engine"
import { motionSettingsSchema } from "../src/lib/render/project"
import { renderComposition } from "../src/lib/render/engine"
import { renderInputSchema } from "../src/lib/render/contracts"
const main = async () => {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of process.stdin) {
    length += chunk.length
    if (length > 40 * 1024 * 1024) throw new Error("Render input too large")
    chunks.push(Buffer.from(chunk))
  }
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  const input = renderInputSchema.parse(payload.input)
  const bytes =
    input.engine === "hyperframes"
      ? await renderMotionProject(
          Buffer.from(payload.project, "base64"),
          motionSettingsSchema.parse({
            width: input.width,
            height: input.height,
            duration_seconds: input.duration_seconds,
            fps: input.fps,
          }),
        )
      : await renderComposition(input, payload.images)
  process.stdout.write(bytes)
}
void main().catch(() => {
  process.stderr.write("Render command failed\n")
  process.exitCode = 1
})
