import { build } from "esbuild"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import sharp from "sharp"

const icon = await sharp("public/creativeotter.png")
  .resize(280, 280, { fit: "inside" })
  .webp({ quality: 85 })
  .toBuffer()
const result = await build({
  entryPoints: ["src/lib/mcp/ui/entry.tsx"],
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
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CreativeOtter account</title><style>${css}</style></head><body><!-- Third-party licenses\n${licenses.replaceAll("-->", "--&gt;")}\n--><div id="root"></div><script>${js}</script></body></html>`
await mkdir("src/lib/mcp/ui/dist", { recursive: true })
await writeFile("src/lib/mcp/ui/dist/account.html", html)
// Retain notices for dependencies bundled into the iframe.
const notices = await Promise.all(
  [
    "react",
    "react-dom",
    "@modelcontextprotocol/ext-apps",
    "@modelcontextprotocol/sdk",
    "zod",
    "lucide-react",
  ].map(async (name) => {
    const pkg = JSON.parse(
      await readFile(`node_modules/${name}/package.json`, "utf8"),
    )
    return `${name} ${pkg.version}: ${pkg.license}`
  }),
)
await writeFile("src/lib/mcp/ui/dist/NOTICE.txt", notices.join("\n") + "\n")
process.stdout.write(
  `Built CreativeOtter MCP account UI (${Math.ceil(Buffer.byteLength(html) / 1024)} KB).\n`,
)
