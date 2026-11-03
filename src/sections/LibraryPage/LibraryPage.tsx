import { StudioShell } from "@/components/studio/StudioShell"
import { SectionHeading } from "@/components/common/SectionHeading"
import { LibraryUploader } from "@/components/studio/LibraryUploader"
import { LibraryBrowser } from "@/components/studio/LibraryBrowser"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { listLibraryAssets } from "@/lib/studio/service"
import { getMediaAccess } from "@/lib/media/service"
export type LibraryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const LibraryPage = async ({ searchParams }: LibraryPageProps) => {
  const params = await searchParams,
    { supabase, workspace } = await getPersonalWorkspace("/studio/library")
  const options = {
    q: typeof params.q === "string" ? params.q : "",
    kind: typeof params.kind === "string" ? params.kind : "",
    favorite: params.favorites === "true",
    page: Math.max(1, Number(params.page) || 1),
  }
  const [data, access] = await Promise.all([
    listLibraryAssets(supabase, workspace.id, options),
    getMediaAccess(supabase, workspace.id),
  ])
  return (
    <StudioShell>
      <SectionHeading
        title="Your library"
        description="Your generated images and references. Private, saved and ready for your next idea."
      />
      {access.enabled && access.can_prepare && <LibraryUploader />}
      <LibraryBrowser
        key={workspace.id}
        {...data}
        {...options}
      />
    </StudioShell>
  )
}
export default LibraryPage
