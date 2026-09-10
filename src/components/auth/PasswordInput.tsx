"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({
  name,
  label,
  autoComplete,
  required = true,
}: {
  name: string;
  label: string;
  autoComplete: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-extrabold text-ink-soft">{label}</span>
      <span className="relative">
        <input
          name={name}
          type={visible ? "text" : "password"}
          aria-label={label}
          autoComplete={autoComplete}
          required={required}
          minLength={8}
          className="input pr-12"
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
    </label>
  );
}
