"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { signUpAction, type AuthActionState, type AuthFieldErrors } from "@/app/auth/actions";

const initialState: AuthActionState = {};

export default function SignUpPage() {
  const [state, formAction] = useActionState(signUpAction, initialState);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [editedFields, setEditedFields] = useState<Set<keyof AuthFieldErrors>>(() => new Set());
  const [dismissedFormError, setDismissedFormError] = useState(false);

  function markEdited(field: keyof AuthFieldErrors) {
    setEditedFields((current) => {
      const next = new Set(current);
      next.add(field);
      if (field === "password" || field === "confirmPassword") {
        next.add("password");
        next.add("confirmPassword");
      }
      return next;
    });
    setDismissedFormError(true);
  }

  function fieldError(field: keyof AuthFieldErrors) {
    return editedFields.has(field) ? undefined : state.fieldErrors?.[field];
  }

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
      <form
        action={formAction}
        onSubmit={() => {
          setEditedFields(new Set());
          setDismissedFormError(false);
        }}
        className="grid gap-4"
      >
        {state.error && !dismissedFormError ? <AuthError>{state.error}</AuthError> : null}
        <label className="grid gap-1.5">
          <span className="text-xs font-extrabold text-ink-soft">Email address</span>
          <input
            name="email"
            type="email"
            aria-label="Email address"
            aria-invalid={fieldError("email") ? true : undefined}
            aria-describedby={fieldError("email") ? "email-error" : undefined}
            autoComplete="email"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              markEdited("email");
            }}
            className={`input ${fieldError("email") ? "border-2 border-coral-300 bg-coral-100" : ""}`}
          />
          {fieldError("email") ? <span id="email-error" className="text-xs font-bold text-ink">{fieldError("email")}</span> : null}
        </label>
        <PasswordInput
          name="password"
          label="Password"
          autoComplete="new-password"
          value={password}
          error={fieldError("password")}
          onChange={(event) => {
            setPassword(event.target.value);
            markEdited("password");
          }}
        />
        <PasswordInput
          name="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          value={confirmPassword}
          error={fieldError("confirmPassword")}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            markEdited("confirmPassword");
          }}
        />
        <p className="text-[11px] font-semibold text-muted">Use at least 8 characters. You can finish your profile after email confirmation.</p>
        <SubmitButton>Create account</SubmitButton>
      </form>
    </AuthShell>
  );
}
