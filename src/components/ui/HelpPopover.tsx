"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CircleHelp, X } from "lucide-react";
import {
  autoUpdate, flip, FloatingFocusManager, FloatingPortal, offset, safePolygon,
  shift, size, useDismiss, useFloating, useFocus, useHover, useInteractions, useRole,
} from "@floating-ui/react";

type HelpMode = "closed" | "preview" | "pinned";
const openEvent = "cali:help-open";

export function HelpPopover({ title, children, label }: {
  title: string;
  children: ReactNode;
  label?: string;
}) {
  const id = useId();
  const headingId = `${id}-heading`;
  const [mode, setMode] = useState<HelpMode>("closed");
  const blocked = useRef({ hover: false, focus: false });
  const panel = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  function close(returnFocus = false) {
    blocked.current = { hover: true, focus: returnFocus || document.activeElement === trigger.current };
    setMode("closed");
    if (returnFocus) trigger.current?.focus({ preventScroll: true });
  }

  function open(next: Exclude<HelpMode, "closed">) {
    window.dispatchEvent(new CustomEvent(openEvent, { detail: id }));
    setMode(next);
  }

  useEffect(() => {
    function onOtherHelp(event: Event) {
      if ((event as CustomEvent<string>).detail !== id && mode !== "closed") {
        blocked.current = { hover: true, focus: document.activeElement === trigger.current };
        setMode("closed");
      }
    }
    window.addEventListener(openEvent, onOtherHelp);
    return () => window.removeEventListener(openEvent, onOtherHelp);
  }, [id, mode]);

  const { refs, floatingStyles, context } = useFloating({
    open: mode !== "closed",
    onOpenChange(next, _event, reason) {
      if (next) {
        if (mode === "pinned") return;
        if (reason === "hover" && blocked.current.hover || reason === "focus" && blocked.current.focus) return;
        open("preview");
      } else {
        if (mode === "pinned" && reason !== "escape-key" && reason !== "outside-press" && reason !== "reference-press") return;
        close(reason === "escape-key");
      }
    },
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 16 }), shift({ padding: 16 }), size({
      padding: 16,
      apply({ availableHeight, elements }) {
        elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
      },
    })],
  });
  const hover = useHover(context, { enabled: mode !== "pinned", mouseOnly: true, delay: { open: 300, close: 150 }, handleClose: safePolygon({ blockPointerEvents: false }) });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  return <>
    <button type="button" ref={(node) => { trigger.current = node; refs.setReference(node); }}
      className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-white/70 hover:text-ink motion-reduce:transition-none"
      {...getReferenceProps({
        "aria-label": label ?? `About ${title}`,
        "aria-controls": mode === "closed" ? undefined : id,
        "aria-expanded": mode !== "closed",
        "aria-haspopup": "dialog",
      })}
      onPointerEnter={() => { blocked.current.hover = false; }}
      onPointerLeave={() => { blocked.current.hover = false; }}
      onBlurCapture={() => { blocked.current.focus = false; }}
      onClick={() => { if (mode === "pinned") close(); else open("pinned"); }}>
      <CircleHelp className="h-5 w-5" aria-hidden />
    </button>
    {mode !== "closed" ? <FloatingPortal>
      <FloatingFocusManager context={context} modal={false} disabled={mode !== "pinned"} initialFocus={panel} returnFocus={false}>
        <div ref={(node) => { panel.current = node; refs.setFloating(node); }} id={id} tabIndex={-1}
          style={floatingStyles}
          className="z-50 w-80 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 text-sm font-semibold leading-relaxed text-ink shadow-card"
          {...getFloatingProps({ id, "aria-labelledby": headingId })}>
          <div className="flex items-start justify-between gap-2">
            <h3 id={headingId} className="min-w-0 self-center font-extrabold">{title}</h3>
            <button type="button" aria-label={`Close ${title} help`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-cream" onClick={() => close(true)}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="grid gap-2 break-words [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:font-bold [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-inside [&_ul]:list-disc">{children}</div>
        </div>
      </FloatingFocusManager>
    </FloatingPortal> : null}
  </>;
}

export function HelpHeading({ title, children, as: Tag = "h2", className = "font-extrabold" }: {
  title: string;
  children: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return <div className="flex min-w-0 items-center justify-between gap-2">
    <Tag className={className}>{title}</Tag>
    <HelpPopover title={title}>{children}</HelpPopover>
  </div>;
}
