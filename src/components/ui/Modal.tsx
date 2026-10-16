"use client";

import { useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import {
  FloatingFocusManager, FloatingNode, FloatingOverlay, FloatingPortal, FloatingTree,
  useDismiss, useFloating, useFloatingNodeId, useInteractions, useRole,
} from "@floating-ui/react";

export interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer: ReactNode;
  help?: ReactNode;
  initialFocus?: RefObject<HTMLElement | null>;
  returnFocus?: RefObject<HTMLElement | null>;
  dismissalDisabled?: boolean;
  onClose: () => void;
}

function ModalContent({ open, title, children, footer, help, initialFocus, returnFocus, dismissalDisabled = false, onClose }: ModalProps) {
  const headingId = useId();
  const overlay = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const nodeId = useFloatingNodeId();
  const { refs, context } = useFloating({
    nodeId, open,
    onOpenChange(next) { if (!next && !dismissalDisabled) onClose(); },
  });
  const dismiss = useDismiss(context, {
    enabled: !dismissalDisabled,
    outsidePressEvent: "click",
    outsidePress: event => event.target === overlay.current,
  });
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  return <FloatingNode id={nodeId}>
    {open ? <FloatingPortal>
      <FloatingOverlay ref={overlay} lockScroll className="z-60 grid h-dvh w-[100dvw] grid-cols-[minmax(0,1fr)] place-items-center bg-ink/40 sm:p-6" data-modal-backdrop>
        <FloatingFocusManager context={context} modal outsideElementsInert restoreFocus initialFocus={initialFocus ?? dialog} returnFocus={returnFocus ?? true}>
          <div ref={(node) => { dialog.current = node; refs.setFloating(node); }} tabIndex={-1}
            className="animate-pop flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white text-ink shadow-card sm:h-auto sm:max-h-full sm:max-w-3xl sm:rounded-3xl"
            {...getFloatingProps({ "aria-labelledby": headingId, "aria-modal": true })}>
            <header className="flex max-h-[40dvh] shrink-0 items-start justify-between gap-2 overflow-y-auto bg-lav-50 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:px-6 sm:py-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1"><h2 id={headingId} className="min-w-0 self-center break-words text-xl font-extrabold leading-tight [overflow-wrap:anywhere] sm:text-2xl">{title}</h2>{help}</div>
              <button type="button" aria-label={`Close ${title.toLowerCase()}`} disabled={dismissalDisabled} onClick={onClose}
                className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full bg-white/70 text-ink-soft hover:bg-white hover:text-ink disabled:cursor-not-allowed disabled:opacity-50">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>
            <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6 [&_input]:min-w-0 [&_select]:min-w-0 [&_textarea]:min-w-0 [&_input]:placeholder:!text-ink-soft [&_textarea]:placeholder:!text-ink-soft" data-modal-body>{children}</div>
            <footer className="max-h-[40dvh] shrink-0 overflow-y-auto bg-lav-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6" data-modal-footer>{footer}</footer>
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal> : null}
  </FloatingNode>;
}

// A local floating tree keeps portaled contextual help inside the modal's focus
// boundary and makes Escape dismiss the innermost open surface first.
export function Modal(props: ModalProps) {
  return <FloatingTree><ModalContent {...props} /></FloatingTree>;
}
