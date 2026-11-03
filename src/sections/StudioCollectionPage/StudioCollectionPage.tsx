import Link from "next/link"
import { notFound } from "next/navigation"
import { Plus } from "lucide-react"
import { StudioShell } from "@/components/studio/StudioShell"
import { StudioRecordCard } from "@/components/studio/StudioRecordCard"
import { SectionHeading } from "@/components/common/SectionHeading"
import { EmptyState } from "@/components/common/EmptyState"
import { getPersonalWorkspace } from "@/lib/auth/session"
import {
  listStudioRecords,
  getProjectChargeTotals,
  getRecordImages,
} from "@/lib/studio/service"
import { sectionSchema, unitsToCredits } from "@/lib/studio/contracts"
import { studioSections } from "@/lib/studio/config"
type StudioCollectionPageProps = {
  params: Promise<{ section: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const StudioCollectionPage = async ({
  params,
  searchParams,
}: StudioCollectionPageProps) => {
  const parsed = sectionSchema.safeParse((await params).section)
  if (!parsed.success) notFound()
  const section = parsed.data,
    config = studioSections[section],
    search = await searchParams,
    archived = search.archived === "true",
    q = typeof search.q === "string" ? search.q.slice(0, 120) : ""
  const { supabase, workspace } = await getPersonalWorkspace(
    `/studio/${section}`,
  )
  const records = await listStudioRecords(
    supabase,
    workspace.id,
    section,
    archived,
  )
  const filtered = records.filter(
    (r) =>
      !q ||
      `${r.name} ${r.description}`.toLowerCase().includes(q.toLowerCase()),
  )
  const [images, charges] = await Promise.all([
    getRecordImages(supabase, workspace.id, filtered),
    getProjectChargeTotals(
      supabase,
      workspace.id,
      filtered.filter((record) => "kind" in record).map((record) => record.id),
    ),
  ])
  const cards = filtered.map((record) => ({
    record,
    imageUrl: images[record.id],
    charged:
      "kind" in record ? unitsToCredits(charges[record.id] || "0") : undefined,
  }))

  return (
    <StudioShell>
      <SectionHeading
        title={config.title}
        description={config.description}
      >
        <Link
          href={`/studio/${section}/new`}
          className="button-primary"
        >
          <Plus size={16} />
          New {config.singular}
        </Link>
      </SectionHeading>
      {(section === "voices" || section === "music" || section === "films") && (
        <div className="notice-inline">
          {section === "voices"
            ? "Voice directions and browser auditions are available. Provider voices, cloning and downloadable audio are disabled."
            : section === "music"
              ? "Music briefs and lyrics are available. Audio generation and provider track samples are disabled."
              : "Film planning and storyboard editing are available. Video generation and rendering are disabled."}
        </div>
      )}
      <div className="collection-toolbar">
        <form action={`/studio/${section}`}>
          <input
            name="q"
            type="search"
            aria-label={`Search ${section}`}
            placeholder={`Search ${section}…`}
            defaultValue={q}
          />
          {archived && (
            <input
              type="hidden"
              name="archived"
              value="true"
            />
          )}
          <button className="button-secondary">Search</button>
        </form>
        <Link
          href={`/studio/${section}${archived ? "" : "?archived=true"}`}
          className="button-text"
        >
          {archived ? "Show active" : "Archived"}
        </Link>
      </div>
      {cards.length ? (
        <div className="record-grid">
          {cards.map((card) => (
            <StudioRecordCard
              {...card}
              key={card.record.id}
              section={section}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            q
              ? "No matching records"
              : archived
                ? "No archived records"
                : config.empty
          }
          description={
            q
              ? "Try another name or clear your search."
              : "Save your creative direction here and reuse it with your connected assistants."
          }
          href={`/studio/${section}/new`}
          label={`New ${config.singular}`}
        />
      )}
      <p className="small-muted">
        Showing up to 100 {archived ? "archived" : "active"} records.
      </p>
    </StudioShell>
  )
}
export default StudioCollectionPage
