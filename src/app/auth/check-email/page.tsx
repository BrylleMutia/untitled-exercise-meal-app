"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { useActionState } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthError, AuthSuccess } from "@/components/auth/AuthShell";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { resendConfirmationAction, type AuthActionState } from "@/app/auth/actions";

const initialState: AuthActionState = {};

export default function CheckEmailPage() {
  const [state, formAction] = useActionState(resendConfirmationAction, initialState);
  return (
    <AuthShell
      eyebrow="One more step"
      title="Check your email"
      description="If you are creating a new account, use the confirmation link from Supabase to finish setup. If you already have an account, sign in instead. A confirmed link will return you to onboarding."
      footer={
        <Link href="/auth/sign-in" className="font-extrabold text-ink underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <div className="grid gap-4 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-lav-100">
          <Mail className="h-7 w-7" aria-hidden />
        </div>
        {state.error ? <AuthError>{state.error}</AuthError> : null}
        {state.success ? <AuthSuccess>{state.success}</AuthSuccess> : null}
        <p className="rounded-2xl bg-mint-100 p-4 text-sm font-bold text-ink">
          If you do not see it soon, check spam or request a new link below. If you already have an account, use the sign-in link instead.
        </p>
        <form action={formAction} className="grid gap-3 text-left">
          <label className="grid gap-1.5">
            <span className="text-xs font-extrabold text-ink-soft">Signup email</span>
            <input name="email" type="email" aria-label="Signup email" autoComplete="email" required className="input" />
          </label>
          <SubmitButton>Resend confirmation</SubmitButton>
        </form>
      </div>
    </AuthShell>
  );
}
