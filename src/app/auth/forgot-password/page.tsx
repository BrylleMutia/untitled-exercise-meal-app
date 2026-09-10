"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthError, AuthShell, AuthSuccess } from "@/components/auth/AuthShell";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { forgotPasswordAction, type AuthActionState } from "@/app/auth/actions";

const initialState: AuthActionState = {};

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState);
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your email and we will send a recovery link if an account is associated with it."
      footer={<Link href="/auth/sign-in" className="font-extrabold text-ink underline underline-offset-4">Back to sign in</Link>}
    >
      <form action={formAction} className="grid gap-4">
        {state.error ? <AuthError>{state.error}</AuthError> : null}
        {state.success ? <AuthSuccess>{state.success}</AuthSuccess> : null}
        <label className="grid gap-1.5">
          <span className="text-xs font-extrabold text-ink-soft">Email address</span>
          <input name="email" type="email" aria-label="Email address" autoComplete="email" required className="input" />
        </label>
        <SubmitButton>Send reset link</SubmitButton>
      </form>
    </AuthShell>
  );
}
