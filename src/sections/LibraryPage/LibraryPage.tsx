import Link from "next/link"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { signAsset } from "@/lib/media/assets"
import { getMediaAccess } from "@/lib/media/service"
import { StudioShell } from "@/components/studio/StudioShell"
import { LibraryUploader } from "@/components/studio/LibraryUploader"
import { LibraryAsset } from "@/components/studio/LibraryAsset"

const LibraryPage = async () => {
  const { supabase, workspace } = await getPersonalWorkspace("/studio/library")
  const access = await getMediaAccess(supabase, workspace.id)
  const rows = await supabase
    .from("media_assets")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(50)
  if (rows.error) throw new Error("Unable to open this library")
  const ids = (rows.data || []).map((asset) => asset.id)
  const native = ids.length
    ? await supabase
        .from("native_generations")
        .select("id,asset_id")
        .in("asset_id", ids)
    : { data: [] }
  const jobs = ids.length
    ? await supabase
        .from("generation_jobs")
        .select("id,output_asset_id")
        .in("output_asset_id", ids)
    : { data: [] }
  const assets = await Promise.all(
    (rows.data || []).map(async (row) => ({
      asset: await signAsset(supabase, row),
      kind: row.kind,
      href: native.data?.find((value) => value.asset_id === row.id)
        ? `/studio/native/${native.data.find((value) => value.asset_id === row.id)!.id}`
        : jobs.data?.find((value) => value.output_asset_id === row.id)
          ? `/studio/jobs/${jobs.data.find((value) => value.output_asset_id === row.id)!.id}`
          : null,
    })),
  )
  return (
    <StudioShell>
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-800">
        Your private library
      </p>
      <h1 className="mt-3 text-4xl font-medium tracking-tight">
        A home for your next idea.
      </h1>
      <p className="mt-4 mb-8 max-w-2xl text-sm leading-7 text-stone-600">
        Keep native creations, provider results and reference images together.
        Create with your assistant’s available tools first; save the result here
        when you need to reuse it.
      </p>
      {access.enabled ? (
        <LibraryUploader />
      ) : (
        <p className="rounded-2xl border border-stone-200 p-5 text-sm text-stone-600">
          Library uploads are not enabled for this workspace yet. Native tools
          can still create images directly in your assistant.{" "}
          <Link
            href="/dashboard"
            className="underline"
          >
            Check your account
          </Link>
          .
        </p>
      )}
      {assets.length ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((value) => (
            <LibraryAsset
              key={value.asset.id}
              {...value}
            />
          ))}
        </div>
      ) : (
        <p className="mt-12 text-center text-sm text-stone-500">
          Your saved images and references will appear here.
        </p>
      )}
      <p className="mt-8 text-xs text-stone-400">
        Showing your latest 50 saved assets.
      </p>
    </StudioShell>
  )
}
export default LibraryPage
