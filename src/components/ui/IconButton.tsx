"use client";

import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Button } from "./Button";

export function IconButton({ label, tooltip, children, disabled, size = "default", variant = "soft", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string; tooltip: string; children: ReactNode; size?: "default" | "compact"; variant?: "primary" | "soft";
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setVisible(false);
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [visible]);
  return <span className="relative inline-flex shrink-0" onMouseEnter={() => { if (!disabled) setVisible(true); }} onMouseLeave={() => setVisible(false)}>
    <Button {...props} variant={variant} disabled={disabled} aria-label={label} aria-describedby={visible && !disabled ? id : undefined}
      onFocus={() => setVisible(true)} onBlur={() => setVisible(false)} className={`${size === "compact" ? "!min-h-11 !h-11 !w-11" : "!h-[48px] !w-[48px]"} shrink-0 !p-0 ${variant === "soft" ? "bg-cream text-ink-soft hover:bg-lav-100" : ""}`}>
      {children}
    </Button>
    {visible && !disabled ? <span className="absolute bottom-full right-0 z-20 pb-2"><span id={id} role="tooltip" className="block rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">{tooltip}</span></span> : null}
  </span>;
}
