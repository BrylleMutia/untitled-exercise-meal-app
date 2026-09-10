"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { signUpAction, type AuthActionState } from "@/app/auth/actions";

const initialState: AuthActionState = {};

export default function SignUpPage() {
  const [state, formAction] = useActionState(signUpAction, initialState);
  return (
    <AuthShell
      eyebrow="Start gently"
      title="Create your account"
      description="Your account keeps future plans and completed history separate, editable, and private."
      footer={
        <>
          Already have an account? <Link href="/auth/sign-in" className="font-extrabold text-ink underline underline-offset-4">Sign in</Link>
        </>
      }
    >
      <form action={formAction} className="grid gap-4">
        {state.error ? <AuthError>{state.error}</AuthError> : null}
        <label className="grid gap-1.5">
          <span className="text-xs font-extrabold text-ink-soft">Email address</span>
          <input name="email" type="email" aria-label="Email address" autoComplete="email" required className="input" />
        </label>
        <PasswordInput name="password" label="Password" autoComplete="new-password" />
        <PasswordInput name="confirmPassword" label="Confirm password" autoComplete="new-password" />
        <p className="text-[11px] font-semibold text-muted">Use at least 8 characters. You can finish your profile after email confirmation.</p>
        <SubmitButton>Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}
