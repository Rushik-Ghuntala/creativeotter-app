import assert from "node:assert/strict"
import { createServer } from "node:http"
import { once } from "node:events"
import { readFile } from "node:fs/promises"
import { build } from "esbuild"
import { chromium } from "playwright"
const main = async () => {
  const bundled = await build({
    stdin: {
      contents:
        'import {createRoot} from "react-dom/client";import {RenderStudio} from "./src/components/render/RenderStudio";createRoot(document.getElementById("root")).render(<RenderStudio available={true} prices={{png:"16000",mp4:"16000"}} saved={[]}/>);',
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    plugins: [
      {
        name: "mock-next-router",
        setup: (builder) => {
          builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: "router",
            namespace: "fixture",
          }))
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              "export const useRouter=()=>({refresh:()=>{window.__renderRefreshes=(window.__renderRefreshes||0)+1}})",
          }))
        },
      },
    ],
    jsx: "automatic",
    bundle: true,
    write: false,
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
  })
  const js = bundled.outputFiles[0].text.replaceAll("</script", "<\\/script")
  const css = await readFile("src/styles/render.css", "utf8")
  let sequence = 0
  let title = ""
  let succeeded = false
  let uncertain = true
  let saves = 0
  let savedProject: unknown = null
  const requests: { request_key: string; input: { revision_id: string } }[] = []
  const snapshot = (state: string) => ({
    render_id:
      sequence === 1
        ? "10000000-0000-4000-8000-000000000001"
        : "10000000-0000-4000-8000-000000000002",
    title,
    format: "mp4",
    state,
    credit_units: "16000",
    credit_status:
      state === "failed"
        ? "released"
        : state === "succeeded"
          ? "charged"
          : "reserved",
    width: 640,
    height: 800,
    duration_seconds: 4,
    preview_url: null,
    download_url: null,
    urls_expire_at: null,
    saved: state === "succeeded",
    message: "UI state fixture; no render or credit transaction.",
  })
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith("/api/motion")) {
      response.setHeader("Content-Type", "application/json")
      if (request.method === "POST") {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const body = JSON.parse(Buffer.concat(chunks).toString())
        saves++
        savedProject = {
          revision: {
            id: "10000000-0000-4000-8000-000000000010",
            project_id: "10000000-0000-4000-8000-000000000010",
            title: body.title,
            version: 1,
            settings: body.settings,
          },
          files: body.files || body.changes,
          history: [],
        }
        response.end(JSON.stringify(savedProject))
      } else response.end(JSON.stringify({ projects: [] }))
    } else if (request.url?.startsWith("/api/render")) {
      response.setHeader("Content-Type", "application/json")
      if (request.method === "POST") {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        const body = JSON.parse(Buffer.concat(chunks).toString())
        title = body.input.title
        requests.push(body)
        if (uncertain) {
          uncertain = false
          response.statusCode = 503
          response.end(JSON.stringify({ error: "Temporary test interruption" }))
          return
        }
        sequence++
        response.end(JSON.stringify(snapshot("queued")))
      } else
        response.end(
          JSON.stringify(snapshot(succeeded ? "succeeded" : "failed")),
        )
    } else {
      response.setHeader("Content-Type", "text/html")
      response.end(
        `<!doctype html><style>${css}</style><div id="root"></div><script>${js}</script>`,
      )
    }
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("No test port")
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
  })
  try {
    const page = await browser.newPage()
    page.on("pageerror", (error) => {
      process.stderr.write(`UI harness: ${error.message}\n`)
    })
    await page.goto(`http://127.0.0.1:${address.port}`)
    const create = page.getByRole("button", {
      name: "Create video · 16 credits",
      exact: true,
    })
    await page
      .getByLabel("Project name / headline", { exact: true })
      .fill("A new beginning")
    await create.click()
    await page
      .getByText("Temporary test interruption", { exact: true })
      .waitFor()
    assert.equal(saves, 1)
    await create.click()
    await page
      .getByRole("heading", { name: "Let’s try again", exact: true })
      .waitFor()
    assert.equal(await create.isEnabled(), true)
    assert.equal(saves, 1, "An unchanged retry must reuse the saved revision")
    assert.equal(
      requests[0].request_key,
      requests[1].request_key,
      "An uncertain render response must retain its idempotency key",
    )
    assert.equal(requests[0].input.revision_id, requests[1].input.revision_id)
    succeeded = true
    await create.click()
    await page
      .getByRole("heading", { name: "Your design is ready", exact: true })
      .waitFor()
    assert.equal(await create.isEnabled(), true)
    await page
      .getByRole("button", {
        name: "A new beginning · Motion graphic",
        exact: true,
      })
      .waitFor()
    assert.notEqual(
      requests[1].request_key,
      requests[2].request_key,
      "A new explicit render after a known failure is a fresh request",
    )
    assert.ok(
      (await page.evaluate(
        () =>
          (window as unknown as { __renderRefreshes: number })
            .__renderRefreshes,
      )) >= 4,
    )
    process.stdout.write(
      "Passed UI recovery: an uncertain request reuses one source revision and one render key; Create recovers after failure/success and saved designs appear. Mock states only; no rendering or credits.\n",
    )
  } finally {
    await browser.close()
    server.close()
    await once(server, "close")
  }
}
void main().catch((error) => {
  process.stderr.write(`Render controls test failed: ${error.message}\n`)
  process.exitCode = 1
})
