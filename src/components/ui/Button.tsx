import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "soft" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-soft",
  soft: "bg-white/70 text-ink hover:bg-white",
  ghost: "bg-transparent text-ink-soft hover:bg-black/5",
  danger: "bg-coral-200 text-ink hover:bg-coral-300",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = "primary", className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
