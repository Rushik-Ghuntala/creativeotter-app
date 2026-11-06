import { getPersonalWorkspace } from "@/lib/auth/session"
import { getRenderAccess } from "@/lib/render/service"
import { RenderStudio } from "@/components/render/RenderStudio"
import { StudioShell } from "@/components/studio/StudioShell"
import { SectionHeading } from "@/components/common/SectionHeading"
import "@/styles/render.css"
const DesignsPage = async () => {
  const { supabase, workspace } = await getPersonalWorkspace("/studio/designs")
  const access = await getRenderAccess(supabase, workspace.id)
  const jobs = await supabase
    .from("render_jobs")
    .select("id,input")
    .eq("workspace_id", workspace.id)
    .eq("state", "succeeded")
    .order("created_at", { ascending: false })
    .limit(20)
  return (
    <StudioShell>
      <SectionHeading
        title="Designs that move you."
        description="Animated graphics, editable projects and beautiful motion. Made with your ideas."
      />
      <RenderStudio
        available={access.available}
        prices={{ png: access.png_credit_units, mp4: access.mp4_credit_units }}
        saved={(jobs.data || []).map((job) => ({
          id: job.id,
          title: job.input.title,
          format: job.input.format,
        }))}
      />
    </StudioShell>
  )
}
export default DesignsPage
