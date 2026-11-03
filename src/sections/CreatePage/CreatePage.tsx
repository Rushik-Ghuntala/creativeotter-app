import { StudioShell } from "@/components/studio/StudioShell"
import { SectionHeading } from "@/components/common/SectionHeading"
import { CreateBrief } from "@/components/studio/CreateBrief"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { listStudioRecords } from "@/lib/studio/service"
type CreatePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const CreatePage = async ({ searchParams }: CreatePageProps) => {
  const { supabase, workspace } = await getPersonalWorkspace("/studio/create"),
    search = await searchParams
  const [brands, characters] = await Promise.all([
    listStudioRecords(supabase, workspace.id, "brands"),
    listStudioRecords(supabase, workspace.id, "characters"),
  ])
  return (
    <StudioShell>
      <SectionHeading
        title="Make something worth sharing."
        description="Bring a brief, a brand and a little imagination."
      />
      <CreateBrief
        initialBrief={
          typeof search.brief === "string" ? search.brief.slice(0, 7000) : ""
        }
        brands={brands.map(({ id, name }) => ({ id, name }))}
        characters={characters.map(({ id, name }) => ({ id, name }))}
      />
    </StudioShell>
  )
}
export default CreatePage
