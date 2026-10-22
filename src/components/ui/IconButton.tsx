"use client";

import { useCallback, useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import { autoUpdate, flip, FloatingNode, FloatingPortal, offset, shift, useFloating, useFloatingNodeId, useMergeRefs } from "@floating-ui/react";
import { Button } from "./Button";

export function IconButton({ label, tooltip, children, disabled, size = "default", variant = "soft", buttonRef, portalTooltip = false, onFocus, onBlur, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string; tooltip: string; children: ReactNode; size?: "default" | "compact"; variant?: "primary" | "soft" | "image" | "danger"; buttonRef?: Ref<HTMLButtonElement>; portalTooltip?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const nodeId = useFloatingNodeId();
  const { refs, floatingStyles } = useFloating({ nodeId, open: portalTooltip && visible && !disabled, placement: "top", strategy: "fixed",
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })], whileElementsMounted: portalTooltip ? autoUpdate : undefined });
  const setReference = useCallback((node: HTMLButtonElement | null) => refs.setReference(node), [refs]);
  const reference = useMergeRefs([setReference, buttonRef]);
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
  return <FloatingNode id={nodeId}><span className="relative inline-flex shrink-0" onMouseEnter={() => { if (!disabled) setVisible(true); }} onMouseLeave={() => setVisible(false)}>
    <Button {...props} ref={reference} variant={variant === "image" ? "soft" : variant} disabled={disabled} title={disabled ? tooltip : props.title} aria-label={label} aria-describedby={visible && !disabled ? id : undefined}
      onFocus={event => { setVisible(true); onFocus?.(event); }} onBlur={event => { setVisible(false); onBlur?.(event); }} className={`${variant === "image" || size === "compact" ? "!min-h-[44px] !h-[44px] !w-[44px]" : "!h-[48px] !w-[48px]"} shrink-0 !p-0 ${variant === "soft" ? "bg-cream text-ink-soft hover:bg-lav-100" : variant === "image" ? "!rounded-full !bg-white text-ink shadow-[0_2px_6px_rgb(37_38_53/18%)] hover:!bg-lav-50" : ""}`}>
      {children}
    </Button>
    {visible && !disabled ? portalTooltip ? <FloatingPortal><span ref={node => refs.setFloating(node)} style={floatingStyles} id={id} role="tooltip" className="pointer-events-none z-70 max-w-[calc(100vw-1rem)] break-words rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">{tooltip}</span></FloatingPortal> : <span className="absolute bottom-full right-0 z-20 pb-2"><span id={id} role="tooltip" className="block rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white">{tooltip}</span></span> : null}
  </span></FloatingNode>;
}
