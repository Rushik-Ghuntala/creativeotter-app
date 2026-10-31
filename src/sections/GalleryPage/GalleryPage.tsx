import { notFound } from "next/navigation"
import { getPersonalWorkspace } from "@/lib/auth/session"
import {
  parseGalleryQuery,
  buildGalleryUrl,
} from "@/lib/media/gallery-contracts"
import { getImageGallery } from "@/lib/media/gallery"
import { getAppUrl } from "@/lib/env"
import { StudioShell } from "@/components/studio/StudioShell"
import { WebImageGallery } from "@/components/generation/WebImageGallery"

type GalleryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const GalleryPage = async ({ searchParams }: GalleryPageProps) => {
  const awaitQuery = await searchParams
  const request = (() => {
    try {
      return parseGalleryQuery(awaitQuery)
    } catch {
      return null
    }
  })()
  if (!request) notFound()
  const url = new URL(buildGalleryUrl(getAppUrl(), request))
  const { supabase, workspace } = await getPersonalWorkspace(
    `${url.pathname}${url.search}`,
  )
  const gallery = await getImageGallery(supabase, workspace.id, request).catch(
    () => null,
  )
  if (!gallery) notFound()
  return (
    <StudioShell>
      <WebImageGallery gallery={gallery} />
    </StudioShell>
  )
}
export default GalleryPage
