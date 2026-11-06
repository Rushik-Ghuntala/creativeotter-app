import { build } from "esbuild"
import { readFile, writeFile, mkdir } from "node:fs/promises"

const icon = await readFile("public/creativeotter-widget.webp")
const licenseNames = [
  "react",
  "react-dom",
  "scheduler",
  "@modelcontextprotocol/ext-apps",
  "@modelcontextprotocol/sdk",
  "zod",
  "lucide-react",
]
const licenses = (
  await Promise.all(
    licenseNames.map(
      async (name) =>
        `${name}\n${await readFile(`node_modules/${name}/LICENSE`, "utf8")}`,
    ),
  )
).join("\n\n")
await mkdir("src/lib/mcp/ui/dist", { recursive: true })
for (const [name, entry, title] of [
  ["render", "src/lib/mcp/ui/render-entry.tsx", "CreativeOtter design"],
  ["account", "src/lib/mcp/ui/entry.tsx", "CreativeOtter account"],
  ["generation", "src/lib/mcp/ui/generation-entry.tsx", "CreativeOtter image"],
]) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    outdir: "src/lib/mcp/ui/dist",
    format: "iife",
    minify: true,
    target: "es2020",
    define: {
      "process.env.NODE_ENV": '"production"',
      __OTTER_ICON__: JSON.stringify(
        `data:image/webp;base64,${icon.toString("base64")}`,
      ),
    },
    legalComments: "inline",
  })
  const js = result.outputFiles
    .find((file) => file.path.endsWith(".js"))
    .text.replaceAll("</script", String.raw`<\/script`)
  const css = result.outputFiles.find((file) => file.path.endsWith(".css")).text
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html,body{margin:0}${css}</style></head><body><!-- Third-party licenses\n${licenses.replaceAll("-->", "--&gt;")}\n--><div id="root"></div><script>${js}</script></body></html>`
  await writeFile(`src/lib/mcp/ui/dist/${name}.html`, html)
  process.stdout.write(
    `Built CreativeOtter ${name} UI (${Math.ceil(Buffer.byteLength(html) / 1024)} KB).\n`,
  )
}
await writeFile("src/lib/mcp/ui/dist/NOTICE.txt", licenses)
