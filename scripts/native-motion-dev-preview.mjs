import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
const report = JSON.parse(
  await readFile("/tmp/creativeotter-native-motion-report.json", "utf8"),
)
const ids = new Set(
  report.jobs
    .filter(
      (j) => ["codex", "claude"].includes(j.host) && j.state === "succeeded",
    )
    .map((j) => j.id),
)
if (ids.size !== 2)
  throw new Error("Expected exactly two disposable saved test videos")
const server = createServer(async (req, res) => {
  if (
    req.url !== "/api/render/preview" ||
    !["POST", "OPTIONS"].includes(req.method)
  ) {
    res.writeHead(404).end()
    return
  }
  try {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 200) {
        res.writeHead(413).end()
        return
      }
      chunks.push(chunk)
    }
    const body = Buffer.concat(chunks)
    if (req.method === "POST") {
      const data = JSON.parse(body)
      if (
        Object.keys(data).length !== 1 ||
        !ids.has(data.render_id) ||
        !/^Bearer rp1\.[A-Za-z0-9_-]{43}$/.test(req.headers.authorization || "")
      ) {
        res.writeHead(403).end()
        return
      }
    }
    const response = await fetch("http://localhost:3001/api/render/preview", {
      method: req.method,
      headers: {
        Authorization: req.headers.authorization || "",
        "Content-Type": "application/json",
        ...(req.headers.origin ? { Origin: req.headers.origin } : {}),
      },
      ...(req.method === "POST" ? { body } : {}),
      signal: AbortSignal.timeout(15000),
    })
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    res.writeHead(400).end()
  }
})
server.listen(3004, "127.0.0.1", () =>
  process.stderr.write(
    "Test-video-only preview relay ready. All other IDs and paths denied.\n",
  ),
)
