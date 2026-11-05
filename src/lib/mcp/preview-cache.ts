import type { GenerationSnapshot } from "@/lib/media/contracts"
import {
  previewAccessSchema,
  type PreviewAccess,
} from "@/lib/mcp/preview-access-contracts"
type PreviewStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
const browserStorage = (): PreviewStorage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}
const scope = (items: GenerationSnapshot[]) => {
  if (
    !items.length ||
    items.length > 20 ||
    items.some((item) => item.state !== "succeeded" || !item.outputs.length)
  )
    return null
  try {
    const origins = items.map(
      (item) => new URL(item.job_url || item.review_url || "").origin,
    )
    if (origins.some((origin) => origin !== origins[0])) return null
    const ids = items
      .map((item) => `${item.execution_source}:${item.generation_id}`)
      .sort()
    return {
      origin: origins[0],
      key: `creativeotter.saved-preview.v1:${origins[0]}:${ids.join(",")}`,
    }
  } catch {
    return null
  }
}
const persistent = (
  access: PreviewAccess | null,
  origin: string,
): access is PreviewAccess => {
  if (
    !access ||
    access.expires_at !== null ||
    !/^sp1\.[A-Za-z0-9_-]{43}$/.test(access.token)
  )
    return false
  try {
    const url = new URL(access.url)
    return (
      url.origin === origin &&
      url.pathname === "/api/preview/status" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}
// Claude can restore structured tool output without its private _meta. Retain
// ONLY the approved opaque, revocable saved-image capability in this app's
// private browser origin. Never cache an OAuth-bearing encrypted delegation.
export const rememberSavedPreviewAccess = (
  items: GenerationSnapshot[],
  access: PreviewAccess | null,
  storage = browserStorage(),
) => {
  const target = scope(items)
  if (!target || !storage || !persistent(access, target.origin)) return
  try {
    storage.setItem(
      target.key,
      JSON.stringify({
        url: access.url,
        token: access.token,
        expires_at: null,
      }),
    )
  } catch {
    /* Storage can be unavailable in some hosts. */
  }
}
export const restoreSavedPreviewAccess = (
  items: GenerationSnapshot[],
  provided: PreviewAccess | null,
  storage = browserStorage(),
): PreviewAccess | null => {
  const target = scope(items)
  if (!target || !storage) return provided
  if (persistent(provided, target.origin)) {
    rememberSavedPreviewAccess(items, provided, storage)
    return provided
  }
  try {
    const cached = previewAccessSchema.safeParse(
      JSON.parse(storage.getItem(target.key) || "null"),
    )
    if (cached.success && persistent(cached.data, target.origin))
      return cached.data
  } catch {
    /* Ignore inaccessible or corrupt private state. */
  }
  return provided
}
export const forgetSavedPreviewAccess = (
  items: GenerationSnapshot[],
  storage = browserStorage(),
) => {
  const target = scope(items)
  if (!target || !storage) return
  try {
    storage.removeItem(target.key)
  } catch {
    /* No usable cache in this host. */
  }
}
