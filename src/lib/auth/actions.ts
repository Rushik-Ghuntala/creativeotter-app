"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { createServerSupabase } from "@/lib/supabase/server"
import { getAppUrl } from "@/lib/env"
import { safeNextPath } from "@/lib/auth/redirects"
import { requireWebSession } from "@/lib/auth/session"
import type { AuthState } from "@/lib/auth/types"

const emailSchema = z.email().max(254)
const passwordSchema = z.string().min(12).max(128)

export const signIn = async (
  _state: AuthState,
  form: FormData,
): Promise<AuthState> => {
  const email = emailSchema.safeParse(form.get("email"))
  const password = z.string().min(1).max(128).safeParse(form.get("password"))
  if (!email.success || !password.success)
    return { error: "Enter a valid email and password." }
  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password: password.data,
  })
  if (error)
    return {
      error: "Sign-in failed. Check your details and confirm your email.",
    }
  redirect(safeNextPath(form.get("next")))
}

export const signUp = async (
  _state: AuthState,
  form: FormData,
): Promise<AuthState> => {
  const email = emailSchema.safeParse(form.get("email"))
  const password = passwordSchema.safeParse(form.get("password"))
  const name = z.string().trim().min(1).max(80).safeParse(form.get("name"))
  if (!email.success || !password.success || !name.success) {
    return {
      error:
        "Enter your name, a valid email and a password of 12–128 characters.",
    }
  }
  const next = safeNextPath(form.get("next"))
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: {
      data: { display_name: name.data },
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })
  if (error)
    return { error: "Unable to create the account. Please try again later." }
  if (data.session) redirect(next)
  return {
    message:
      "Check your email to confirm your account, then return here to sign in.",
  }
}

export const requestPasswordReset = async (
  _state: AuthState,
  form: FormData,
): Promise<AuthState> => {
  const email = emailSchema.safeParse(form.get("email"))
  if (!email.success) return { error: "Enter a valid email address." }
  const supabase = await createServerSupabase()
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${getAppUrl()}/auth/callback?next=/auth/reset-password`,
  })
  return {
    message:
      "If an account exists, a password reset link will arrive by email.",
  }
}

export const resetPassword = async (
  _state: AuthState,
  form: FormData,
): Promise<AuthState> => {
  const password = passwordSchema.safeParse(form.get("password"))
  if (!password.success)
    return { error: "Use a password of 12–128 characters." }
  const { supabase } = await requireWebSession("/auth/reset-password")
  const { error } = await supabase.auth.updateUser({ password: password.data })
  if (error)
    return { error: "Unable to update the password. Request a new reset link." }
  await supabase.auth.signOut({ scope: "local" })
  redirect("/auth/login?updated=1")
}

export const signOut = async () => {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut({ scope: "local" })
  redirect("/auth/login")
}
