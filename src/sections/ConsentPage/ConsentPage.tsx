import Link from "next/link"
import { redirect } from "next/navigation"
import { Brand } from "@/components/common/Brand"
import { Button } from "@/components/ui/button"
import { requireWebSession } from "@/lib/auth/session"
import { decideAuthorization } from "@/lib/oauth/actions"
import { authorizationIdSchema } from "@/lib/oauth/authorization"

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
  if (error || !data || params.error)
    return (
      <main className="mx-auto max-w-lg p-8">
        <Brand />
        <h1 className="mt-12 text-2xl font-semibold">
          This connection needs a fresh start.
        </h1>
        <p className="mt-4 text-stone-600">
          The request expired, could not be completed, or asked for unsupported
          access. Return to your assistant and reconnect.
        </p>
        <Link
          className="mt-6 inline-block underline"
          href="/dashboard"
        >
          Back to your workspace
        </Link>
      </main>
    )
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
          Signed in as {user.email}. This application is requesting read-only
          access to your personal CreativeOtter workspace.
        </p>
        <ul className="mt-6 space-y-3 rounded-2xl bg-stone-50 p-5 text-sm text-stone-700">
          <li>Read your workspace name and enabled capabilities.</li>
          <li>
            View basic account settings. It cannot generate media, spend
            credits, change permissions or approve paid work.
          </li>
          <li>Sign-in permissions requested: {data.scope || "email"}.</li>
        </ul>
        <details className="mt-5 text-xs text-stone-500">
          <summary className="cursor-pointer">Application details</summary>
          <p className="mt-2 break-all">Client ID: {data.client.id}</p>
          <p className="mt-2 break-all">Return address: {data.redirect_uri}</p>
          <p className="mt-2">
            An application name is provided by its registrant; it is not a
            verification badge.
          </p>
        </details>
        <form
          action={decideAuthorization}
          className="mt-8 flex gap-3"
        >
          <input
            type="hidden"
            name="authorization_id"
            value={id.data}
          />
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
            Allow read-only access
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
