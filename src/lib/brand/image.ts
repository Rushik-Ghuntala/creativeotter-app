import "server-only"
import sharp from "sharp"
import { parseDocument, DomUtils } from "htmlparser2"
import { validateImageBytes } from "@/lib/media/image-validation"

export const sanitizeBrandSvg = (source: string) => {
  if (
    source.length > 500000 ||
    /<!doctype|<!entity|<\?|<script|<foreignObject/i.test(source)
  )
    throw new Error("Unsupported SVG artwork.")
  const doc = parseDocument(source, { xmlMode: true })
  const tags = new Set([
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "polygon",
    "polyline",
    "line",
    "defs",
    "linearGradient",
    "radialGradient",
    "stop",
    "clipPath",
    "mask",
    "use",
    "title",
    "desc",
  ])
  const roots = DomUtils.findAll((node) => node.name === "svg", doc.children)
  const root = roots[0]
  if (!root || roots.length !== 1) throw new Error("Invalid SVG artwork.")
  for (const node of DomUtils.findAll(() => true, [root])) {
    if (!tags.has(node.name)) throw new Error("Unsupported SVG element.")
    for (const [key, value] of Object.entries(node.attribs)) {
      if (/^on/i.test(key) || key === "style") {
        delete node.attribs[key]
        continue
      }
      if (/href$/i.test(key) && !/^#[\w-]+$/.test(value))
        throw new Error("External SVG references are not supported.")
      if (/url\(/i.test(value) && !/^url\(#[\w-]+\)$/.test(value))
        throw new Error("External SVG references are not supported.")
      if (/currentcolor/i.test(value))
        node.attribs[key] = value.replace(/currentcolor/gi, "#161b22")
    }
  }
  root.attribs.xmlns = "http://www.w3.org/2000/svg"
  return DomUtils.getOuterHTML(root, { xmlMode: true })
}
export const normalizeBrandImage = async (bytes: Buffer, svg = false) => {
  const input = svg
    ? Buffer.from(sanitizeBrandSvg(bytes.toString("utf8")))
    : bytes
  const image = sharp(input, {
    limitInputPixels: 24_000_000,
    pages: 1,
    ...(svg ? { density: 192 } : {}),
  })
  const metadata = await image.metadata()
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < 12 ||
    metadata.height < 12
  )
    throw new Error("Artwork is too small.")
  const output = await image
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: !svg,
    })
    .png()
    .toBuffer()
  const dimensions = validateImageBytes(output, "image/png", 6 * 1024 * 1024)
  return { bytes: output, ...dimensions }
}
