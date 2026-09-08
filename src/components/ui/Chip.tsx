import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

/** Round frosted icon chip, 44px minimum target per accessibility rules. */
export function Chip({ label, className = "", children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/70 text-ink shadow-chip transition-colors hover:bg-white ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
