"use client";

import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Button } from "./Button";

export function IconButton({ label, tooltip, children, disabled, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string; tooltip: string; children: ReactNode;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setVisible(false); };
    document.addEventListener("keydown", dismiss);
    return () => document.removeEventListener("keydown", dismiss);
  }, [visible]);
  return <span className="relative inline-flex shrink-0" onMouseEnter={() => { if (!disabled) setVisible(true); }} onMouseLeave={() => setVisible(false)}>
    <Button {...props} variant="soft" disabled={disabled} aria-label={label} aria-describedby={visible ? id : undefined}
      onFocus={() => setVisible(true)} onBlur={() => setVisible(false)} className="!h-[48px] !w-[48px] shrink-0 !p-0 bg-cream text-ink-soft hover:bg-lav-100">
      {children}
    </Button>
    {visible && !disabled ? <span className="absolute bottom-full right-0 z-20 pb-2"><span id={id} role="tooltip" className="block rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">{tooltip}</span></span> : null}
  </span>;
}
