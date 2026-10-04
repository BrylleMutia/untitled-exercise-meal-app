"use client";

import { useActionState } from "react";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { AuthCompletion } from "@/components/auth/AuthCompletion";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { updatePasswordAction, type AuthActionState } from "@/app/auth/actions";

const initialState: AuthActionState = {};

export default function UpdatePasswordPage() {
  const [state, formAction] = useActionState(updatePasswordAction, initialState);
  if (state.next) return <AuthCompletion next={state.next} />;
  return (
    <AuthShell
      eyebrow="New password"
      title="Choose a fresh password"
      description="Use a password you do not reuse elsewhere. After saving, you will continue to your account."
    >
      <form action={formAction} className="grid gap-4">
        {state.error ? <AuthError>{state.error}</AuthError> : null}
        <PasswordInput name="password" label="New password" autoComplete="new-password" />
        <PasswordInput name="confirmPassword" label="Confirm password" autoComplete="new-password" />
        <SubmitButton>Update password</SubmitButton>
      </form>
    </AuthShell>
  );
}
