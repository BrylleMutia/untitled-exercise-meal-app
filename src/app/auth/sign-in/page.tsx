"use client";

import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { signInAction, type AuthActionState } from "@/app/auth/actions";

const initialState: AuthActionState = {};

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next")?.startsWith("/") ? searchParams.get("next")! : "/";
  const [state, formAction] = useActionState(signInAction, initialState);

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your coach"
      description="Keep your plan, workout history, meals, and progress connected to your account."
      footer={
        <>
          New here? <Link href="/auth/sign-up" className="font-extrabold text-ink underline underline-offset-4">Create an account</Link>
        </>
      }
    >
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        {state.error ? <AuthError>{state.error}</AuthError> : null}
        <label className="grid gap-1.5">
          <span className="text-xs font-extrabold text-ink-soft">Email address</span>
          <input name="email" type="email" aria-label="Email address" autoComplete="email" required className="input" />
        </label>
        <PasswordInput name="password" label="Password" autoComplete="current-password" />
        <div className="flex justify-end">
          <Link href="/auth/forgot-password" className="text-xs font-extrabold text-ink underline underline-offset-4">
            Forgot password?
          </Link>
        </div>
        <SubmitButton>Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}
