import { CreditBalance } from "@/components/dashboard/CreditBalance"
import { getCreditSummary } from "@/lib/credits/service"
import Link from "next/link"
import { Brand } from "@/components/common/Brand"
import { Button } from "@/components/ui/button"
import { ConnectedClient } from "@/components/dashboard/ConnectedClient"
import { getPersonalWorkspace } from "@/lib/auth/session"
import { signOut } from "@/lib/auth/actions"
import { getMcpResource } from "@/lib/env"

const DashboardPage = async () => {
  const { user, workspace, supabase } = await getPersonalWorkspace()
  const { data: grants, error } = await supabase
    .from("client_grants")
    .select("*")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
  if (error) throw new Error("Unable to load connected applications")
  const resource = getMcpResource()
  const credits = await getCreditSummary(supabase, workspace.id)
  return (
    <div className="min-h-screen bg-[#f6f5ef] text-stone-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 border-b border-stone-200 px-6 py-5">
        <Brand />
        <form action={signOut}>
          <Button
            type="submit"
            variant="outline"
          >
            Sign out
          </Button>
        </form>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
          Your workspace
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Good ideas start here.
        </h1>
        <p className="mt-4 text-stone-600">
          {user.email} · {workspace.name}
        </p>
        <CreditBalance summary={credits} />
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          <section className="rounded-3xl bg-[#102f28] p-7 text-white lg:p-9">
            <p className="text-sm text-orange-200">Connect your assistants</p>
            <h2 className="mt-3 text-2xl font-medium">
              Same account. Same workspace.
            </h2>
            <p className="mt-4 text-sm leading-6 text-emerald-100/75">
              Add the endpoint below in Codex or Claude, sign in, and approve
              read-only access. You can disconnect anytime.
            </p>
            <label
              className="mt-7 block text-xs text-emerald-100"
              htmlFor="mcp-url"
            >
              MCP server URL
            </label>
            <input
              id="mcp-url"
              readOnly
              value={resource}
              className="mt-2 h-12 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white"
            />
            <details className="mt-6 text-sm">
              <summary className="cursor-pointer text-orange-200">
                Connection commands
              </summary>
              <p className="mt-4 text-emerald-100/75">Codex CLI</p>
              <pre className="mt-2 overflow-auto rounded-xl bg-black/20 p-3 text-xs">{`codex mcp add creativeotter --url ${resource}\ncodex mcp login creativeotter`}</pre>
              <p className="mt-4 text-emerald-100/75">Claude Code</p>
              <pre className="mt-2 overflow-auto rounded-xl bg-black/20 p-3 text-xs">{`claude mcp add --transport http creativeotter ${resource}`}</pre>
              <p className="mt-4 leading-6 text-emerald-100/75">
                In Claude chat, add a custom connector with this URL. In Codex
                desktop, use MCP or plugin settings. Both connections require
                the hosted OAuth setup to be enabled.
              </p>
            </details>
          </section>
          <section
            id="connected-applications"
            className="rounded-3xl border border-stone-200 bg-white p-7 lg:p-9"
          >
            <h2 className="text-xl font-semibold">Connected applications</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Only apps you approve can read this workspace. Connecting an app
              never approves generation charges.
            </p>
            {grants.length ? (
              <ul className="mt-6">
                {grants.map((grant) => (
                  <ConnectedClient
                    key={grant.id}
                    grant={grant}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-8 rounded-2xl bg-stone-50 p-5 text-sm text-stone-500">
                No assistants connected yet.
              </p>
            )}
          </section>
        </div>
        <section className="mt-6 rounded-2xl border border-stone-200 p-6 text-sm leading-6 text-stone-600">
          <h2 className="font-semibold text-stone-900">
            Native first. Your library, together.
          </h2>
          <p className="mt-1">
            Use your assistant’s available native tools first. Enable media
            preparation on a connection to save existing native images and
            prepare optional provider quotes. Every provider generation requires
            direct approval. Retail credit purchases are not enabled.
          </p>
          <Link
            href="/studio/library"
            className="mt-4 inline-block font-medium text-emerald-900 underline"
          >
            Open your private library
          </Link>
        </section>
      </main>
    </div>
  )
}

export default DashboardPage
