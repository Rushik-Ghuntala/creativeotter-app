import "server-only"
import { createHash } from "node:crypto"
import sharp from "sharp"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import {
  createPublicWebsiteReader,
  publicWebsiteUrl,
  type WebsiteReader,
} from "@/lib/brand/public-fetch"
import {
  extractWebsiteArtwork,
  declaredBrandBundle,
  officialBrandLinks,
  type ArtworkCandidate,
} from "@/lib/brand/extract"
import { normalizeBrandImage } from "@/lib/brand/image"
import {
  beginMediaUpload,
  finishMediaUpload,
  signAsset,
} from "@/lib/media/assets"
import { MEDIA_BUCKET } from "@/lib/media/contracts"

export const collectWebsiteArtwork = async (
  website: string,
  read: WebsiteReader = createPublicWebsiteReader(),
) => {
  const homepage = await read(publicWebsiteUrl(website).href, 2 * 1024 * 1024)
  if (!/html/.test(homepage.mime))
    throw new Error(
      "Please give the company website, rather than an image link.",
    )
  const first = extractWebsiteArtwork(
    homepage.bytes.toString("utf8"),
    homepage.url,
  )
  const candidates = [...first.candidates],
    pages = [homepage.url]
  const supportingLinks = [...first.links]
  if (!first.candidates.some((candidate) => candidate.role === "logo")) {
    const bundle = declaredBrandBundle(
      homepage.bytes.toString("utf8"),
      homepage.url,
    )
    if (bundle) {
      try {
        const resource = await read(bundle, 1536 * 1024)
        if (/javascript|text\/plain/.test(resource.mime))
          supportingLinks.unshift(
            ...officialBrandLinks(
              resource.bytes.toString("utf8"),
              homepage.url,
            ),
          )
      } catch {
        /* Some sites expose only app marks in the public initial page. */
      }
    }
  }
  for (const link of [...new Set(supportingLinks)]
    .filter((link) => link !== homepage.url)
    .slice(0, 2)) {
    try {
      const page = await read(link, 2 * 1024 * 1024)
      const scope = new URL(homepage.url).hostname.replace(/^www\./, "")
      const hostname = new URL(page.url).hostname
      if (
        !(hostname === scope || hostname.endsWith(`.${scope}`)) ||
        !/html/.test(page.mime)
      )
        continue
      pages.push(page.url)
      candidates.push(
        ...extractWebsiteArtwork(
          page.bytes.toString("utf8"),
          page.url,
          homepage.url,
        ).candidates,
      )
    } catch {
      /* A blocked supporting page does not discard usable homepage artwork. */
    }
  }
  const unique = new Map<string, ArtworkCandidate>()
  for (const candidate of candidates.sort((a, b) => b.score - a.score))
    if (!unique.has(candidate.key)) unique.set(candidate.key, candidate)
  return {
    website: homepage.url,
    pages,
    candidates: [...unique.values()].slice(0, 40),
  }
}

export const discoverBrandAssets = async (
  client: SupabaseClient<Database>,
  workspace: string,
  website: string,
  limit: number,
) => {
  // Check the caller's existing workspace grant before DNS/network/storage work.
  const access = await client.rpc("get_generation_access", {
    target_workspace: workspace,
  })
  if (access.error || !access.data?.enabled || !access.data.can_prepare)
    throw new Error(
      "Enable media access in CreativeOtter to save company artwork.",
    )
  const read = createPublicWebsiteReader()
  const found = await collectWebsiteArtwork(website, read)
  const host = new URL(found.website).hostname
  const images: {
    asset_id: string
    path: string
    label: string
    role: ArtworkCandidate["role"]
    source_page: string
    source_url: string | null
    preview_url: string
    thumbnail: string
  }[] = []
  const digests = new Set<string>(),
    counts = new Map<string, number>()
  for (const candidate of found.candidates.slice(0, 16)) {
    if (images.length >= limit) break
    const group = ["logo", "icon"].includes(candidate.role)
      ? "identity"
      : candidate.role
    if ((counts.get(group) || 0) >= (group === "identity" ? 2 : 3)) continue
    try {
      const file = candidate.svg
        ? { bytes: Buffer.from(candidate.svg), mime: "image/svg+xml" }
        : await read(candidate.url!, 6 * 1024 * 1024)
      if (!/^image\/(png|jpeg|webp|svg\+xml|avif|gif)$/.test(file.mime))
        continue
      const normalized = await normalizeBrandImage(
        file.bytes,
        file.mime === "image/svg+xml",
      )
      const sha = createHash("sha256").update(normalized.bytes).digest("hex")
      if (digests.has(sha)) continue
      const label = `${host} · ${candidate.role} · ${candidate.label}`.slice(
        0,
        160,
      )
      const existing = await client
        .from("media_assets")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("status", "ready")
        .eq("kind", "reference")
        .eq("sha256", sha)
        .eq("label", label)
        .limit(1)
        .maybeSingle()
      let saved
      if (existing.data) saved = await signAsset(client, existing.data)
      else {
        const upload = await beginMediaUpload(
          client,
          workspace,
          label,
          "image/png",
        )
        const stored = await client.storage
          .from(MEDIA_BUCKET)
          .uploadToSignedUrl(upload.path, upload.token, normalized.bytes, {
            contentType: "image/png",
          })
        if (stored.error) throw new Error("Could not save artwork.")
        saved = await finishMediaUpload(client, workspace, upload.asset_id)
      }
      digests.add(sha)
      counts.set(group, (counts.get(group) || 0) + 1)
      images.push({
        asset_id: saved.id,
        path: `assets/brand-${sha.slice(0, 16)}.png`,
        label,
        role: candidate.role,
        source_page: candidate.page_url,
        source_url: candidate.url || null,
        preview_url: saved.url,
        thumbnail: (
          await sharp(normalized.bytes)
            .resize({
              width: 384,
              height: 384,
              fit: "inside",
              withoutEnlargement: true,
            })
            .png()
            .toBuffer()
        ).toString("base64"),
      })
    } catch {
      /* Skip invalid, blocked or oversized candidates, never fabricate artwork. */
    }
  }
  return { website: found.website, pages: found.pages, images }
}
