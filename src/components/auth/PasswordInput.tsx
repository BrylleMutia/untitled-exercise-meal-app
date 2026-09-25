"use client";

import { useState } from "react";
import type { ChangeEventHandler } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  name,
  label,
  autoComplete,
  required = true,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  autoComplete: string;
  required?: boolean;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  error?: string;
}) {
  const [visible, setVisible] = useState(false);
  const errorId = `${name}-error`;
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-extrabold text-ink-soft">{label}</span>
      <span className="relative">
        <input
          name={name}
          type={visible ? "text" : "password"}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete={autoComplete}
          required={required}
          minLength={8}
          value={value}
          onChange={onChange}
          className={`input pr-12 ${error ? "border-2 border-coral-300 bg-coral-100" : ""}`}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-lav-50"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </span>
      {error ? <span id={errorId} className="text-xs font-bold text-ink">{error}</span> : null}
    </label>
  );
}
