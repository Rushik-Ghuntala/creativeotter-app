import { z } from "zod"
import { notFound } from "next/navigation"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { getGenerationSnapshot } from "@/lib/media/service"
import { getNativeSnapshot } from "@/lib/media/native"
import { StudioShell } from "@/components/studio/StudioShell"
import { WebGenerationViewer } from "@/components/studio/WebGenerationViewer"

type GenerationPageProps = {
  params: Promise<{ id: string }>
  source: "native" | "provider"
}
const GenerationPage = async ({ params, source }: GenerationPageProps) => {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const path =
    source === "native" ? `/studio/native/${id}` : `/studio/jobs/${id}`
  const { supabase, workspace } = await getPersonalWorkspace(path)
  let snapshot
  if (source === "native")
    snapshot = await getNativeSnapshot(supabase, workspace.id, id).catch(
      () => null,
    )
  else {
    const job = await supabase
      .from("generation_jobs")
      .select("quote_id")
      .eq("id", id)
      .eq("workspace_id", workspace.id)
      .single()
    if (!job.data) notFound()
    snapshot = await getGenerationSnapshot(
      supabase,
      workspace.id,
      job.data.quote_id,
    )
  }
  if (!snapshot) notFound()
  return (
    <StudioShell>
      <WebGenerationViewer initial={snapshot} />
    </StudioShell>
  )
}
export default GenerationPage
