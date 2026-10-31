import Link from "next/link"
import { AuthForm } from "@/components/auth/AuthForm"
import { Brand } from "@/components/common/Brand"
import { safeNextPath } from "@/lib/auth/redirects"
import { requireWebSession } from "@/lib/auth/session"
import type { AuthMode } from "@/lib/auth/types"

type AuthPageProps = {
  mode: AuthMode
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const AuthPage = async ({ mode, searchParams }: AuthPageProps) => {
  const params = await searchParams
  const next = safeNextPath(params.next)
  if (mode === "reset") await requireWebSession("/auth/reset-password")
  const content = {
    login: {
      title: "Welcome back.",
      description: "Sign in to your creative workspace.",
    },
    signup: {
      title: "Make room for your ideas.",
      description: "One account for your studio and connected AI assistants.",
    },
    forgot: {
      title: "A fresh start.",
      description: "We'll email you a link to reset your password.",
    },
    reset: {
      title: "Choose a new password.",
      description: "Keep your creative workspace secure.",
    },
  }[mode]
  return (
    <div className="min-h-screen bg-[#f6f5ef] text-stone-900 lg:grid lg:grid-cols-2">
      <aside className="flex flex-col justify-between bg-[#102f28] p-8 text-[#f6f5ef] lg:min-h-screen lg:p-14">
        <Brand />
        <div className="my-16 max-w-lg lg:my-24">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-orange-200">
            A home for your next idea
          </p>
          <h1 className="text-4xl leading-[1.08] font-medium tracking-tight lg:text-6xl">
            Your studio.
            <br />
            Your assistants.
            <br />
            <span className="text-orange-200">One connection.</span>
          </h1>
          <p className="mt-7 max-w-sm leading-7 text-emerald-100/75">
            Connect your CreativeOtter workspace to Codex and Claude, and keep
            your creative work together.
          </p>
        </div>
        <p className="text-sm text-emerald-100/60">
          Made for the way ideas happen.
        </p>
      </aside>
      <main className="flex items-center justify-center px-6 py-16 lg:px-16">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">
            {content.title}
          </h2>
          <p className="mt-3 mb-9 text-stone-600">{content.description}</p>
          {params.error && (
            <p
              role="alert"
              className="mb-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
            >
              The sign-in link is invalid or expired. Please sign in or request
              a new link.
            </p>
          )}
          {params.updated && (
            <p
              role="status"
              className="mb-5 text-sm text-emerald-800"
            >
              Password updated. Sign in with your new password.
            </p>
          )}
          <AuthForm
            mode={mode}
            next={next}
          />
          <p className="mt-7 text-center text-sm text-stone-600">
            {mode === "login"
              ? "New to CreativeOtter? "
              : "Already have an account? "}
            <Link
              className="font-medium text-emerald-800 hover:underline"
              href={`${mode === "login" ? "/auth/signup" : "/auth/login"}?next=${encodeURIComponent(next)}`}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}

export default AuthPage
