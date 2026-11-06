import sanitizeHtml from "sanitize-html"
import { renderInputSchema, type RenderInput } from "@/lib/render/contracts"

// Defense in depth: allowlisted markup, CSP, a script-disabled browser, no
// network, a new browser process per job, and an external process deadline.
export const validateRenderInput = (value: unknown): RenderInput => {
  const input = renderInputSchema.parse(value)
  if (input.engine === "hyperframes") {
    if (
      !input.revision_id ||
      input.format !== "mp4" ||
      input.html ||
      input.css ||
      input.asset_ids.length
    )
      throw new Error("Choose a saved motion project before rendering.")
    return input
  }
  if (
    !input.html ||
    input.revision_id ||
    input.duration_seconds > 10 ||
    ![12, 24].includes(input.fps)
  )
    throw new Error("Please use a motion project for these settings.")
  if (
    /<\s*(script|iframe|object|embed|link|meta|base|form|video|audio|canvas|style)\b/i.test(
      input.html,
    ) ||
    /\s(?:on[a-z]+|style)\s*=/i.test(input.html) ||
    /(?:javascript|file|https?):/i.test(input.html) ||
    /@import|url\s*\(|expression\s*\(|[\\<>]/i.test(input.css)
  )
    throw new Error(
      "Use self-contained HTML and CSS. Scripts and external links are not supported.",
    )
  const clean = sanitizeHtml(input.html, {
    allowedTags: [
      "div",
      "section",
      "article",
      "main",
      "header",
      "footer",
      "span",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "strong",
      "em",
      "b",
      "i",
      "small",
      "br",
      "ul",
      "ol",
      "li",
      "img",
      "svg",
      "path",
      "circle",
      "rect",
      "line",
      "polygon",
      "polyline",
      "ellipse",
      "g",
      "defs",
      "linearGradient",
      "stop",
    ],
    allowedAttributes: {
      "*": ["class", "id"],
      img: ["src", "alt", "width", "height"],
      svg: ["viewBox", "width", "height", "fill", "xmlns"],
      path: ["d", "fill", "stroke", "stroke-width"],
      circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
      rect: ["x", "y", "width", "height", "rx", "fill"],
      g: ["fill", "transform"],
      line: ["x1", "x2", "y1", "y2", "stroke", "stroke-width"],
      polygon: ["points", "fill"],
      polyline: ["points", "fill", "stroke"],
      ellipse: ["cx", "cy", "rx", "ry", "fill"],
    },
    allowedSchemes: ["asset"],
    allowProtocolRelative: false,
    parser: { lowerCaseAttributeNames: false, lowerCaseTags: false },
    transformTags: {
      img: (_tag, attrs) => {
        const id = /^asset:([a-f0-9-]{36})$/.exec(attrs.src || "")?.[1]
        if (!id || !input.asset_ids.includes(id))
          throw new Error(
            "Choose an image from your CreativeOtter library first.",
          )
        return { tagName: "img", attribs: attrs }
      },
    },
  })
  if (!clean.trim()) throw new Error("Add some visible content to your design.")
  return { ...input, html: clean }
}
export const renderDocument = (
  input: RenderInput,
  images: Record<string, string> = {},
) => {
  const checked = validateRenderInput(input)
  let html = checked.html
  for (const id of checked.asset_ids) {
    const data = images[id]
    if (
      !data ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)
    )
      throw new Error("A design image is unavailable.")
    html = html.replaceAll(`asset:${id}`, data)
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'"><style>*{box-sizing:border-box}html,body{margin:0;width:${input.width}px;height:${input.height}px;overflow:hidden}body{font-family:Arial,sans-serif;background:#fff}${checked.css}</style></head><body>${html}</body></html>`
}
