"use client";

import { useId, useRef, type ReactNode } from "react";

export function ReviewDisclosure({ title, count, children }: { title: string; count: string; children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const contentId = useId();
  function collapse() {
    if (!details.current || !summary.current) return;
    details.current.open = false;
    summary.current.focus({ preventScroll: true });
    summary.current.scrollIntoView({ behavior: "instant", block: "nearest" });
  }
  return <section className="min-w-0" aria-label={title}>
    <details ref={details} className="min-w-0" data-review-disclosure>
      <summary ref={summary} aria-controls={contentId} className="min-h-11 cursor-pointer content-center rounded-xl px-2 text-sm font-bold [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-lav-500">
        <h3 className="inline font-bold">{title}</h3> <span className="font-normal">({count})</span>
      </summary>
      <div id={contentId} className="grid min-w-0 gap-3 px-2 pb-2 pt-2">
        {children}
        <button type="button" aria-label={`Collapse all ${title.toLowerCase()}`} aria-controls={contentId} onClick={collapse}
          className="min-h-11 max-w-full justify-self-start rounded-lg px-1 text-left text-sm font-bold text-[color-mix(in_srgb,var(--color-lav-500)_80%,var(--color-ink))] underline-offset-4 [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-lav-500">
          Collapse all
        </button>
      </div>
    </details>
  </section>;
}
