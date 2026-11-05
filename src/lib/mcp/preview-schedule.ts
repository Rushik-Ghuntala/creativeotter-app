import type { GenerationSnapshot } from "@/lib/media/contracts"
import type { PreviewAccess } from "@/lib/mcp/preview-access-contracts"

// Storage URLs expire independently of generation state. Refresh before expiry,
// and on visibility/online changes after a browser suspends the iframe's timers.
export const signedUrlExpiresAt = (value: string): number | null => {
  try {
    const token = new URL(value).searchParams.get("token")?.split(".")[1]
    if (!token) return null
    const encoded = token.replaceAll("-", "+").replaceAll("_", "/")
    const claims = JSON.parse(
      atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
    )
    return Number.isFinite(claims.exp) ? claims.exp * 1000 : null
  } catch {
    return null
  }
}
export const nextPreviewRefreshAt = (
  snapshot: GenerationSnapshot,
  access: PreviewAccess | null,
  lastSuccess: number,
) => {
  const expiries = [...snapshot.outputs, ...snapshot.references].flatMap(
    (asset) =>
      [asset.url, asset.download_url]
        .map(signedUrlExpiresAt)
        .filter((value): value is number => value !== null),
  )
  return Math.min(
    lastSuccess + 45 * 60 * 1000,
    ...expiries.map((expiry) => expiry - 2 * 60 * 1000),
    ...(access?.expires_at &&
    Date.parse(access.expires_at) - 60 * 1000 > lastSuccess
      ? [Date.parse(access.expires_at) - 60 * 1000]
      : []),
  )
}
