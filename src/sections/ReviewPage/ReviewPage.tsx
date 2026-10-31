/* eslint-disable @next/next/no-img-element -- References use short-lived signed private storage URLs. */
import { z } from "zod"
import { notFound, redirect } from "next/navigation"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { getGenerationSnapshot } from "@/lib/media/service"
import { approveImageGeneration } from "@/lib/media/actions"
import { StudioShell } from "@/components/studio/StudioShell"
import { Button } from "@/components/ui/button"

type ReviewPageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const ReviewPage = async ({ params, searchParams }: ReviewPageProps) => {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { supabase, workspace } = await getPersonalWorkspace(
    `/studio/review/${id}`,
  )
  const snapshot = await getGenerationSnapshot(
    supabase,
    workspace.id,
    id,
    false,
  ).catch(() => null)
  if (!snapshot) notFound()
  if (snapshot.job_url) redirect(snapshot.job_url)
  const query = await searchParams
  return (
    <StudioShell>
      <section className="mx-auto max-w-2xl rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-800">
          Provider fallback · explicit approval
        </p>
        <h1 className="mt-4 text-3xl font-medium tracking-tight">
          Review this image request.
        </h1>
        <p className="mt-4 text-sm leading-7 text-stone-600">
          Your assistant prepared one provider-backed image. This request uses
          the operator’s configured provider account. Native assistant
          generation does not require this approval or a CreativeOtter provider
          key.
        </p>
        <div className="mt-7 rounded-2xl bg-[#eef2e8] p-5">
          <p className="text-xs uppercase tracking-widest text-emerald-800">
            Maximum provider estimate
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {snapshot.estimated_cost_label}
          </p>
          <p className="mt-2 text-xs leading-6 text-stone-500">
            One {snapshot.input.resolution} image · {snapshot.model_name} ·{" "}
            {snapshot.input.aspect_ratio}. Retail credit purchases are not
            enabled. Estimate version: {snapshot.pricing_version}.
          </p>
        </div>
        <h2 className="mt-7 text-sm font-semibold">Exact prompt</h2>
        <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl border border-stone-200 p-5 text-sm leading-7">
          {snapshot.input.prompt}
        </p>
        {snapshot.references.length > 0 && (
          <div className="mt-5 grid grid-cols-3 gap-3">
            {snapshot.references.map((asset, index) => (
              <a
                key={asset.id}
                href={asset.url}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  className="aspect-square w-full rounded-xl border border-stone-200 object-contain"
                  src={asset.url}
                  alt={`Reference ${index + 1}`}
                />
              </a>
            ))}
          </div>
        )}
        <p className="mt-5 text-xs leading-6 text-stone-500">
          These prompt and reference images will be sent to the configured
          fal.ai generation service if you approve. Inputs are fixed to this
          quote. An additional take requires a new quote and approval.
        </p>
        {query.error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
          >
            This request could not be approved. Check provider setup, media
            permissions, quote expiry and the workspace budget. A repeated
            approval cannot create a second job.
          </p>
        )}
        {snapshot.state === "expired" ? (
          <p className="mt-6 font-medium text-amber-800">
            This quote expired. Ask your assistant to prepare a new one.
          </p>
        ) : (
          <form
            action={approveImageGeneration}
            className="mt-7"
          >
            <input
              type="hidden"
              name="quote_id"
              value={snapshot.quote_id || ""}
            />
            <Button
              type="submit"
              className="w-full rounded-full bg-emerald-950 py-6 text-white"
            >
              Approve one image · up to {snapshot.estimated_cost_label}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-xs text-stone-400">
          No provider job is submitted before this approval.
        </p>
      </section>
    </StudioShell>
  )
}
export default ReviewPage
