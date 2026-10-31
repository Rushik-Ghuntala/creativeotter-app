"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  signIn,
  signUp,
  requestPasswordReset,
  resetPassword,
} from "@/lib/auth/actions"
import type { AuthMode, AuthState } from "@/lib/auth/types"

type AuthFormProps = { mode: AuthMode; next: string }

export const AuthForm = ({ mode, next }: AuthFormProps) => {
  const action = {
    login: signIn,
    signup: signUp,
    forgot: requestPasswordReset,
    reset: resetPassword,
  }[mode]
  const [state, submit, pending] = useActionState<AuthState, FormData>(
    action,
    {},
  )
  const inputClass =
    "mt-2 h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-base outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100"
  return (
    <form
      action={submit}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="next"
        value={next}
      />
      {mode === "signup" && (
        <label
          className="block text-sm font-medium"
          htmlFor="name"
        >
          Name
          <input
            className={inputClass}
            id="name"
            name="name"
            autoComplete="name"
            required
            maxLength={80}
          />
        </label>
      )}
      {mode !== "reset" && (
        <label
          className="block text-sm font-medium"
          htmlFor="email"
        >
          Email address
          <input
            className={inputClass}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
      )}
      {mode !== "forgot" && (
        <label
          className="block text-sm font-medium"
          htmlFor="password"
        >
          {mode === "reset" ? "New password" : "Password"}
          <input
            className={inputClass}
            id="password"
            name="password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={mode === "login" ? 1 : 12}
            maxLength={128}
          />
          {mode === "signup" && (
            <span className="mt-2 block text-xs font-normal text-stone-500">
              Use at least 12 characters.
            </span>
          )}
        </label>
      )}
      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}
      {state.message && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {state.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl bg-emerald-950 text-base hover:bg-emerald-900"
      >
        {pending
          ? "Please wait…"
          : {
              login: "Sign in",
              signup: "Create account",
              forgot: "Send reset link",
              reset: "Save new password",
            }[mode]}
      </Button>
      {mode === "login" && (
        <Link
          className="block text-center text-sm text-emerald-800 hover:underline"
          href="/auth/forgot-password"
        >
          Forgot your password?
        </Link>
      )}
    </form>
  )
}
