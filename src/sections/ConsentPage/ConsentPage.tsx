import Link from "next/link"
import { redirect } from "next/navigation"
import { Brand } from "@/components/common/Brand"
import { Button } from "@/components/ui/button"
import { requireWebSession } from "@/lib/auth/session"
import { decideAuthorization } from "@/lib/oauth/actions"
import { authorizationIdSchema } from "@/lib/oauth/authorization"
import { getConsentFailure } from "@/lib/oauth/consent-failure"

type ConsentPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const ConsentPage = async ({ searchParams }: ConsentPageProps) => {
  const params = await searchParams
  const id = authorizationIdSchema.safeParse(params.authorization_id)
  if (!id.success)
    return (
      <main className="mx-auto max-w-lg p-8">
        <Brand />
        <h1 className="mt-12 text-2xl font-semibold">
          Start from your assistant.
        </h1>
        <p className="mt-4 text-stone-600">
          Add the CreativeOtter connector in Codex or Claude, then follow its
          sign-in link.
        </p>
        <Link
          className="mt-6 inline-block underline"
          href="/dashboard"
        >
          Go to your workspace
        </Link>
      </main>
    )
  const { supabase, user } = await requireWebSession(
    `/oauth/consent?authorization_id=${id.data}`,
  )
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(
    id.data,
  )
  if (data && "redirect_url" in data) redirect(data.redirect_url)
  if (error || !data || params.error) {
    const failure = getConsentFailure(error || !data ? "expired" : params.error)
    return (
      <main className="mx-auto max-w-lg p-8">
        <Brand />
        <h1 className="mt-12 text-2xl font-semibold">{failure.title}</h1>
        <p className="mt-4 text-stone-600">{failure.message}</p>
        <Link
          className="mt-6 inline-block underline"
          href={
            failure.retry
              ? `/oauth/consent?authorization_id=${id.data}`
              : "/connect"
          }
        >
          {failure.retry ? "Try again" : "Connection help"}
        </Link>
      </main>
    )
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f5ef] px-6 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <Brand />
        <p className="mt-9 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Connect an assistant
        </p>
        <h1 className="mt-3 text-2xl font-semibold">
          Allow {data.client.name} to connect?
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Signed in as {user.email}. Choose what this assistant can do in your
          personal CreativeOtter workspace.
        </p>
        <ul className="mt-6 space-y-3 rounded-2xl bg-stone-50 p-5 text-sm text-stone-700">
          <li>Read your workspace name and enabled capabilities.</li>
          <li>
            View basic account settings. Without the optional media access
            below, it can only read account details. It cannot change
            permissions or start generation without media access.
          </li>
        </ul>
        {data.scope.split(/\s+/).includes("phone") && (
          <p className="mt-4 text-sm text-stone-600">
            This assistant also requested your phone identity, if present on
            your account.
          </p>
        )}
        <details className="mt-5 text-xs text-stone-500">
          <summary className="cursor-pointer">Application details</summary>
          <p className="mt-2 break-all">Client ID: {data.client.id}</p>
          <p className="mt-2 break-all">Return address: {data.redirect_uri}</p>
          <p className="mt-2">
            Sign-in permissions requested: {data.scope || "email"}.
          </p>
          <p className="mt-2">
            An application name is provided by its registrant; it is not a
            verification badge.
          </p>
        </details>
        <form
          action={decideAuthorization}
          className="mt-8 flex flex-wrap gap-3"
        >
          <input
            type="hidden"
            name="authorization_id"
            value={id.data}
          />
          <label className="mb-4 flex w-full items-start gap-3 rounded-xl border border-stone-200 p-4 text-sm leading-6">
            <input
              type="checkbox"
              name="media_access"
              value="yes"
              className="mt-1"
            />
            <span>
              <strong>
                Also allow media library and requested generation.
              </strong>
              <br />
              Save private images and references and generate images when you
              request them. Native and API generation automatically spend
              CreativeOtter credits at the configured price after a balance
              check; there is no extra browser approval for each image.
            </span>
          </label>
          <Button
            name="decision"
            value="deny"
            type="submit"
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            name="decision"
            value="approve"
            type="submit"
            className="flex-1 bg-emerald-950 hover:bg-emerald-900"
          >
            Allow selected access
          </Button>
        </form>
        <p className="mt-5 text-xs leading-5 text-stone-500">
          You can disconnect this application from your workspace at any time.
        </p>
      </section>
    </main>
  )
}

export default ConsentPage
