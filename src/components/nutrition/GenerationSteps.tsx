"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export const personalGenerationSteps = ["Choose days", "Choose recipes", "Preview", "Unused servings", "Review"] as const;
export const groupGenerationSteps = ["Setup", "Choose recipes", "Preview", "Recipes to cook", "Review"] as const;

function focusHeading(heading: HTMLHeadingElement | null) {
  heading?.focus({ preventScroll: true });
  const body = heading?.closest('[role="dialog"]')?.querySelector<HTMLElement>("[data-modal-body]");
  if (body) body.scrollTop = 0;
}

export function useGenerationSteps() {
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    focusHeading(headingRef.current);
  }, [step]);
  function resetSteps() {
    setStep(0);
    focusHeading(headingRef.current);
  }
  return { step, setStep, headingRef, resetSteps };
}

export function GenerationDraftNotice({ children, disabled, discarding, onDiscard }: { children: ReactNode; disabled: boolean; discarding: boolean; onDiscard: () => void }) {
  return <div role="status" className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-lav-50 p-3 text-sm">
    <p className="min-w-0 flex-1 basis-48">{children}</p>
    <Button variant="ghost" className="max-w-full shrink-0 !px-2 text-sm underline" disabled={disabled} aria-busy={discarding} onClick={onDiscard}>{discarding ? "Discarding…" : "Discard draft"}</Button>
  </div>;
}

/** Keep panels mounted so browsing steps preserves preview selection and local input drafts. */
export function GenerationStep({ active, title, children }: { active: boolean; title: string; children: ReactNode }) {
  return <div hidden={!active} className="min-w-0" role="group" aria-label={`${title} step`}><div className="grid min-w-0 gap-5">{children}</div></div>;
}

export function GenerationReview({ items, onEdit, disabled }: { items: Array<{ label: string; value: string; step: number }>; onEdit: (step: number) => void; disabled: boolean }) {
  return <dl className="grid min-w-0 divide-y divide-ink/10">{items.map(item => <div key={item.label} className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0">
    <div className="min-w-0"><dt className="text-xs font-bold text-ink-soft">{item.label}</dt><dd className="mt-1 break-words text-sm font-bold">{item.value}</dd></div>
    <Button variant="ghost" disabled={disabled} onClick={() => onEdit(item.step)} aria-label={`Edit ${item.label.toLowerCase()}`}>Edit</Button>
  </div>)}</dl>;
}
