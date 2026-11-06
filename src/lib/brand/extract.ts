import { parseDocument, DomUtils } from "htmlparser2"
import { createHash } from "node:crypto"
import { publicWebsiteUrl } from "@/lib/brand/public-fetch"
export type ArtworkCandidate = {
  key: string
  url?: string
  svg?: string
  page_url: string
  label: string
  role: "logo" | "icon" | "character" | "product" | "artwork"
  score: number
}
const clean = (value: string) =>
  value
    .replace(/[<>\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
export const extractWebsiteArtwork = (
  html: string,
  page: string,
  companyWebsite = page,
) => {
  const doc = parseDocument(html)
  const elements = DomUtils.findAll(() => true, doc.children)
  const candidates: ArtworkCandidate[] = [],
    links: string[] = []
  const add = (
    source: string,
    label: string,
    hint: string,
    score: number,
    forced?: ArtworkCandidate["role"],
  ) => {
    try {
      const url = publicWebsiteUrl(source, page).href
      const clues = decodeURIComponent(`${url} ${label} ${hint}`).toLowerCase()
      if (
        /tracking|pixel|spacer|badge|avatar|testimonial|customer.logo|partner.logo|reviewer|trustpilot/.test(
          clues,
        )
      )
        return
      if (
        secondaryPage &&
        /blog[-_ ]?logo|blog wordmark/i.test(`${url} ${label}`)
      )
        return
      const role =
        forced ||
        (/mascot|character|\/agents?\/|illustration.*duo|duo[-_.]/.test(
          clues,
        ) && !/thumb|screenshot|dashboard|interface/.test(clues)
          ? "character"
          : /logo|wordmark|brandmark|logotype/.test(clues)
            ? "logo"
            : /screenshot|product|dashboard|interface|feature|hero|screen/.test(
                  clues,
                )
              ? "product"
              : "artwork")
      candidates.push({
        key: url,
        url,
        page_url: page,
        label: clean(label || url.split("/").at(-1) || role),
        role,
        score:
          score +
          (role === "logo"
            ? 60
            : role === "character"
              ? 50
              : role === "product"
                ? 20
                : 0),
      })
    } catch {
      /* Invalid and non-public URL forms are ignored. */
    }
  }
  const secondaryPage =
    new URL(page).hostname !== new URL(companyWebsite).hostname
  const brand = new URL(companyWebsite).hostname
    .replace(/^www\./, "")
    .split(".")[0]
  for (const [index, node] of elements.entries()) {
    const a = node.attribs
    let parent = node.parent,
      context = "",
      home = false
    for (let depth = 0; parent && depth < 4; depth++, parent = parent.parent) {
      if ("attribs" in parent) {
        context += ` ${parent.attribs.class || ""} ${parent.attribs.id || ""}`
        if (
          parent.name === "a" &&
          /^\/(?:homepage)?$/.test(parent.attribs.href || "")
        )
          home = true
      }
    }
    const customer =
      /customer|testimonial|partner|sponsor|integrations|marquee/i.test(context)
    const hint = `${a.class || ""} ${a.id || ""} ${context}`
    const label = a.alt || a["aria-label"] || a.title || ""
    if (node.name === "img" && !customer) {
      const source = a["data-src"] || a.src || a["data-lazy-src"] || ""
      if (source) add(source, label, hint, index < 180 ? 20 : 0)
      const set = a.srcset || a["data-srcset"]
      if (set)
        add(set.split(",").at(-1)!.trim().split(/\s+/)[0], label, hint, 15)
    }
    if (node.name === "source" && a.srcset && !customer)
      add(a.srcset.split(",").at(-1)!.trim().split(/\s+/)[0], label, hint, 5)
    if (
      node.name === "meta" &&
      /^(og:image|twitter:image)(:url)?$/.test(a.property || a.name || "")
    )
      add(a.content || "", "Company social preview", "", 25)
    if (
      node.name === "link" &&
      /^(apple-touch-icon|icon)$/.test(a.rel || "") &&
      !/\.ico(?:\?|$)/i.test(a.href || "")
    )
      add(a.href || "", `${brand} app icon`, "", 10, "icon")
    if (
      node.name === "a" &&
      a.href &&
      /\/(?:brand|press|media|mascot|characters|about|agents|product|features)(?:[/-]|$)/i.test(
        a.href,
      )
    ) {
      try {
        const u = publicWebsiteUrl(a.href, page)
        const companyHost = new URL(page).hostname.replace(/^www\./, "")
        if (
          (u.hostname === companyHost ||
            u.hostname.endsWith(`.${companyHost}`)) &&
          !u.search
        )
          links.push(u.href)
      } catch {}
    }
    if (
      node.name === "svg" &&
      !customer &&
      (home || /logo|wordmark|brandmark/i.test(`${label} ${hint}`))
    ) {
      if (
        !label.toLowerCase().includes(brand) &&
        !(home && (!label || /^(logo|brand|home)$/i.test(label)))
      )
        continue
      if (secondaryPage && /blog/i.test(label)) continue
      const svg = DomUtils.getOuterHTML(node)
      if (svg.length < 80000 && svg.includes("<path"))
        candidates.push({
          key: `inline:${createHash("sha256").update(svg).digest("hex")}`,
          svg,
          page_url: page,
          label: clean(label || `${brand} logo`),
          role: "logo",
          score: 100,
        })
    }
    for (const match of (a.style || "").matchAll(
      /url\(["']?([^)'"\s]+)["']?\)/g,
    ))
      if (!customer) add(match[1], label, hint, 5)
  }
  // Hydration payloads often expose original hero/agent files without rendering JS.
  const decoded = html
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
  for (const match of decoded.matchAll(
    /["']((?:https:\/\/|\/)[^\s<>"']{1,1500}\.(?:png|jpe?g|webp|svg)(?:\?[^\s<>"']*)?)["']/gi,
  )) {
    if (
      /mascot|character|\/agents?\/|logo|wordmark|hero|screenshot|product/i.test(
        match[1],
      )
    )
      add(match[1], "", "", 0)
  }
  const unique = new Map<string, ArtworkCandidate>()
  for (const candidate of candidates.sort((a, b) => b.score - a.score))
    if (!unique.has(candidate.key)) unique.set(candidate.key, candidate)
  return {
    candidates: [...unique.values()].slice(0, 40),
    links: [...new Set(links)]
      .sort(
        (a, b) =>
          Number(/brand|press|media/i.test(b)) -
          Number(/brand|press|media/i.test(a)),
      )
      .slice(0, 6),
  }
}

// Read only a declared app bundle when a JS homepage exposes no full logo.
// It is parsed as text for official brand-page links, never executed.
export const declaredBrandBundle = (html: string, page: string) => {
  const nodes = DomUtils.findAll(
    (node) => node.name === "script",
    parseDocument(html).children,
  )
  for (const node of nodes) {
    const source = node.attribs.src
    if (!source) continue
    try {
      const url = publicWebsiteUrl(source, page)
      if (/(?:^|\/)(?:app|main|index|home|page)[-./]/i.test(url.pathname))
        return url.href
    } catch {}
  }
  return null
}
export const officialBrandLinks = (source: string, page: string) => {
  const scope = new URL(page).hostname.replace(/^www\./, "")
  const decoded = source.replace(/\\u002[fF]/g, "/").replace(/\\\//g, "/")
  const links: string[] = []
  for (const match of decoded.matchAll(/https:\/\/[^\s"'<>`\\)]+/g)) {
    try {
      const url = publicWebsiteUrl(match[0])
      if (
        (url.hostname === scope || url.hostname.endsWith(`.${scope}`)) &&
        /(?:^|[./-])(?:press|brand|design|media)(?:[./-]|$)/i.test(
          url.hostname + url.pathname,
        ) &&
        !url.search
      )
        links.push(url.href)
    } catch {}
  }
  return [...new Set(links)].slice(0, 2)
}
