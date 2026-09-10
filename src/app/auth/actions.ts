"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: string;
  success?: string;
};

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function safeNextPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const requestHeaders = await headers();
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const host = requestHeaders.get("host") ?? "localhost:3000";
  return `${protocol}://${host}`;
}

function configurationError(error: unknown): string {
  if (error instanceof Error && error.message.includes("NEXT_PUBLIC_SUPABASE")) {
    return "Supabase is not configured. Add the project URL and publishable key to .env.local.";
  }
  return "Authentication is temporarily unavailable. Please try again.";
}

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const next = safeNextPath(value(formData, "next"));
  if (!email || !password) return { error: "Enter your email and password." };

  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    return { error: configurationError(error) };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "That email and password combination could not be signed in." };
  }
  redirect(next);
}

export async function signUpAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = value(formData, "email").toLowerCase();
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  if (!email || password.length < 8) {
    return { error: "Use a valid email and a password with at least 8 characters." };
  }
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  let supabase;
  let signedIn = false;
  try {
    supabase = await createClient();
    const origin = await siteOrigin();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/confirm?next=/onboarding`,
      },
    });
    if (error) return { error: "We could not create that account. Check the details and try again." };
    signedIn = Boolean(data.session);
  } catch (error) {
    return { error: configurationError(error) };
  }

  if (signedIn) redirect("/onboarding");
  redirect("/auth/check-email");
}

export async function forgotPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = value(formData, "email").toLowerCase();
  if (!email) return { error: "Enter your email address." };

  try {
    const supabase = await createClient();
    const origin = await siteOrigin();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/confirm?type=recovery&next=/auth/update-password`,
    });
  } catch (error) {
    return { error: configurationError(error) };
  }

  // Do not reveal whether an account exists for this address.
  return { success: "If an account exists, a password-reset link is on its way." };
}

export async function resendConfirmationAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = value(formData, "email").toLowerCase();
  if (!email) return { error: "Enter the email address you used to sign up." };

  try {
    const supabase = await createClient();
    const origin = await siteOrigin();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${origin}/auth/confirm?next=/onboarding` },
    });
    if (error) {
      return { error: "Supabase could not resend the confirmation email. Check the account status and SMTP logs." };
    }
  } catch (error) {
    return { error: configurationError(error) };
  }

  return { success: "If this account needs confirmation, a new link is on its way." };
}

export async function updatePasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    return { error: configurationError(error) };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "We could not update your password. Request a new link and try again." };
  redirect("/onboarding");
}

export async function signOutAction() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Redirect to the public auth surface even if the remote sign-out failed.
  }
  redirect("/auth/sign-in");
}
