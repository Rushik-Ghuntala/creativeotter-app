/* eslint-disable @next/next/no-img-element -- References use short-lived signed private storage URLs. */
import { formatCreditUnits } from "@/lib/credits/contracts"
import { getCreditSummary } from "@/lib/credits/service"
import { z } from "zod"
import { notFound, redirect } from "next/navigation"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { getNativeSnapshot } from "@/lib/media/native"
import { getGenerationSnapshot } from "@/lib/media/service"
import {
  approveImageGeneration,
  approveNativeGeneration,
} from "@/lib/media/actions"
import { StudioShell } from "@/components/studio/StudioShell"
import { Button } from "@/components/ui/button"

type ReviewPageProps = {
  source?: "native" | "provider"
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}
const ReviewPage = async ({
  params,
  searchParams,
  source = "provider",
}: ReviewPageProps) => {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { supabase, workspace } = await getPersonalWorkspace(
    source === "native"
      ? `/studio/native/review/${id}`
      : `/studio/review/${id}`,
  )
  const snapshot = await (
    source === "native"
      ? getNativeSnapshot(supabase, workspace.id, id)
      : getGenerationSnapshot(supabase, workspace.id, id, false)
  ).catch(() => null)
  if (!snapshot) notFound()
  if (
    snapshot.job_url &&
    snapshot.state !== "awaiting_approval" &&
    snapshot.state !== "expired"
  )
    redirect(snapshot.job_url)
  const credits = await getCreditSummary(supabase, workspace.id)
  const sufficient = Boolean(
    credits &&
    snapshot.credit_units &&
    BigInt(credits.available_units) >= BigInt(snapshot.credit_units),
  )
  const query = await searchParams
  return (
    <StudioShell>
      <section className="mx-auto max-w-2xl rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-800">
          {source === "native"
            ? "Native generation · credit approval"
            : "Provider fallback · credit approval"}
        </p>
        <h1 className="mt-4 text-3xl font-medium tracking-tight">
          Review this image request.
        </h1>
        <p className="mt-4 text-sm leading-7 text-stone-600">
          {source === "native"
            ? "Your assistant will use its native image tool after you approve this CreativeOtter credit price. Native-first reduces operating cost; customer credits still apply. Host usage may also apply."
            : "Your assistant prepared one API-backed image using our configured provider account. CreativeOtter credits apply to both execution routes."}
        </p>
        <div className="mt-7 rounded-2xl bg-[#eef2e8] p-5">
          <p className="text-xs uppercase tracking-widest text-emerald-800">
            CreativeOtter credits
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {snapshot.credit_units
              ? `${formatCreditUnits(snapshot.credit_units)} credits`
              : "Unavailable"}
          </p>
          <p className="mt-2 text-sm text-emerald-900">
            Available:{" "}
            {credits
              ? formatCreditUnits(credits.available_units)
              : "unavailable"}{" "}
            credits. Reserved on approval; charged once the image is saved.
          </p>
          <p className="mt-2 text-xs leading-6 text-stone-500">
            {snapshot.input.resolution
              ? `One ${snapshot.input.resolution} image`
              : "One image"}{" "}
            · {snapshot.model_name} · {snapshot.input.aspect_ratio}. Retail
            credit purchases are not enabled.{" "}
            {source === "provider" && (
              <>Provider maximum: {snapshot.estimated_cost_label}. </>
            )}
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
          {source === "native"
            ? "Your assistant will use these fixed inputs in its native tool after claiming this approved request. A new take requires a fresh quote and approval."
            : "These prompt and reference images will be sent to fal.ai if you approve. Inputs are fixed to this quote. A new take requires a fresh quote and approval."}
        </p>
        {query.error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
          >
            This request could not be approved. Check provider setup, media
            permissions, quote expiry, available credits and the workspace
            budget. A repeated approval cannot create a second job.
          </p>
        )}
        {snapshot.state === "expired" ? (
          <p className="mt-6 font-medium text-amber-800">
            This quote expired. Ask your assistant to prepare a new one.
          </p>
        ) : (
          <form
            action={
              source === "native"
                ? approveNativeGeneration
                : approveImageGeneration
            }
            className="mt-7"
          >
            <input
              type="hidden"
              name={source === "native" ? "generation_id" : "quote_id"}
              value={
                source === "native"
                  ? snapshot.generation_id
                  : snapshot.quote_id || ""
              }
            />
            <Button
              type="submit"
              disabled={!sufficient}
              className="w-full rounded-full bg-emerald-950 py-6 text-white"
            >
              {sufficient
                ? `Approve one image · ${formatCreditUnits(snapshot.credit_units || "0")} credits`
                : "Insufficient credits or unavailable balance"}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-xs text-stone-400">
          No generation may start before this approval and its credit
          reservation.
        </p>
      </section>
    </StudioShell>
  )
}
export default ReviewPage
