import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"
import { StudioShell } from "@/components/studio/StudioShell"
import { SectionHeading } from "@/components/common/SectionHeading"
import { RecordEditor } from "@/components/studio/RecordEditor"
import { ActionForm } from "@/components/common/ActionForm"
import { CopyButton } from "@/components/common/CopyButton"
import { StoryboardEditor } from "@/components/studio/StoryboardEditor"
import { ProjectAssets } from "@/components/studio/ProjectAssets"
import { VoiceAudition } from "@/components/studio/VoiceAudition"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { getStudioRecord, getProjectDetails } from "@/lib/studio/service"
import { sectionSchema } from "@/lib/studio/contracts"
import { studioSections } from "@/lib/studio/config"
import { archiveRecordAction } from "@/lib/studio/actions"
type StudioEditorPageProps = {
  params: Promise<{ section: string; id?: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const StudioEditorPage = async ({
  params,
  searchParams,
}: StudioEditorPageProps) => {
  const route = await params,
    parsed = sectionSchema.safeParse(route.section)
  if (!parsed.success || (route.id && !z.uuid().safeParse(route.id).success))
    notFound()
  const section = parsed.data,
    config = studioSections[section],
    search = await searchParams
  const { supabase, workspace } = await getPersonalWorkspace(
    `/studio/${section}${route.id ? `/${route.id}` : "/new"}`,
  )
  const record = route.id
    ? await getStudioRecord(supabase, workspace.id, section, route.id).catch(
        () => null,
      )
    : undefined
  if (record === null) notFound()
  const assets = await supabase
    .from("media_assets")
    .select("id,label")
    .eq("workspace_id", workspace.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(100)
  if (assets.error) throw new Error("Unable to load reference images")
  const project =
    record && "kind" in record
      ? await getProjectDetails(supabase, workspace.id, record.id)
      : null
  return (
    <StudioShell>
      <Link
        className="back-link"
        href={`/studio/${section}`}
      >
        ←{" "}
        {section === "brands"
          ? "Brand kits"
          : section[0].toUpperCase() + section.slice(1)}
      </Link>
      <SectionHeading
        title={record?.name || `New ${config.singular}`}
        description={
          record
            ? "Your creative direction, saved and ready to reuse."
            : `Save a ${config.singular} in your private workspace.`
        }
      >
        {record && (
          <CopyButton
            text={`Use CreativeOtter ${config.singular} ${record.id} (${record.name}). Load its saved details and references before preparing my next creative request.`}
            label="Copy assistant prompt"
          />
        )}
      </SectionHeading>
      <div className="editor-layout">
        <RecordEditor
          section={section}
          record={record}
          assets={assets.data}
          initialName={
            typeof search.name === "string" ? search.name.slice(0, 80) : ""
          }
          initialBrief={
            typeof search.brief === "string" ? search.brief.slice(0, 4000) : ""
          }
        />
        <aside>
          <section className="panel editor-note">
            <p className="eyebrow">CreativeOtter workspace</p>
            <h2>Keep the idea connected.</h2>
            <p>{config.description}</p>
            <p>
              Creating or editing this record does not generate media or spend
              credits.
            </p>
            <Link
              className="button-text"
              href="/connect"
            >
              Connect your assistant ↗
            </Link>
            <Link
              className="button-text"
              href="/studio/library"
            >
              Upload or find a reference ↗
            </Link>
            {record && (
              <>
                <div className="record-id">
                  <small>Record ID</small>
                  <code>{record.id}</code>
                </div>
                <ActionForm
                  action={archiveRecordAction}
                  submitLabel={
                    record.archived_at ? "Restore record" : "Archive record"
                  }
                  danger={!record.archived_at}
                >
                  <input
                    type="hidden"
                    name="section"
                    value={section}
                  />
                  <input
                    type="hidden"
                    name="id"
                    value={record.id}
                  />
                  <input
                    type="hidden"
                    name="archive"
                    value={String(!record.archived_at)}
                  />
                </ActionForm>
              </>
            )}
          </section>
          {record && "script" in record && (
            <VoiceAudition
              script={record.script}
              language={record.language}
            />
          )}
        </aside>
      </div>
      {record && project && (
        <>
          {section === "films" && (
            <StoryboardEditor
              projectId={record.id}
              shots={project.shots}
              assets={assets.data}
            />
          )}
          <ProjectAssets
            projectId={record.id}
            assets={project.assets}
            chargedUnits={project.charged_units}
            available={assets.data}
            budget={
              "budget_target_units" in record
                ? record.budget_target_units
                : null
            }
          />
          <a
            className="button-secondary export-project"
            href={`/api/studio/projects/${record.id}/export`}
          >
            Download project & storyboard JSON
          </a>
        </>
      )}
    </StudioShell>
  )
}
export default StudioEditorPage
