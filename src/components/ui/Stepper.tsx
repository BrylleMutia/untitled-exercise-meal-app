"use client";

import { useId, type ReactNode, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export function Stepper({ label, steps, step, headingRef, headingLevel = "h1", help }: {
  label: string;
  steps: readonly string[];
  step: number;
  headingRef: RefObject<HTMLHeadingElement | null>;
  headingLevel?: "h1" | "h2" | "h3";
  help?: ReactNode;
}) {
  const countId = useId();
  const Heading = headingLevel;
  return <div className="min-w-0" data-stepper>
    <p id={countId} className="text-xs font-extrabold uppercase tracking-widest text-ink-soft">{label} · step {step + 1} of {steps.length}</p>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><Heading ref={headingRef} tabIndex={-1} aria-describedby={countId} className="mt-1 min-w-0 wrap-anywhere text-2xl font-extrabold">{steps[step]}</Heading>{help}</div>
    <div className="mt-3 flex gap-1.5" aria-hidden>{steps.map((title, index) => <span key={title} className={`h-1.5 min-w-0 flex-1 rounded-full ${index <= step ? "bg-lav-500" : "bg-lav-100"}`} />)}</div>
  </div>;
}

export function StepperActions({ step, total, busy, continueDisabled = false, onBack, onContinue, onClose, finalAction, className = "" }: {
  step: number;
  total: number;
  busy: boolean;
  continueDisabled?: boolean;
  onBack: () => void;
  onContinue: () => void;
  onClose?: () => void;
  finalAction: ReactNode;
  className?: string;
}) {
  return <div className={`@container flex min-w-0 gap-3 ${className}`}>
    {step > 0 ? <Button className="@max-[20rem]:!px-3" variant="soft" disabled={busy} onClick={onBack}><ChevronLeft className="h-4 w-4 shrink-0 @max-[20rem]:hidden" aria-hidden />Back</Button> : onClose ? <Button className="@max-[20rem]:!px-3" variant="soft" disabled={busy} onClick={onClose}>Close</Button> : null}
    {step < total - 1 ? <Button className="min-w-0 flex-1 @max-[20rem]:!px-3" disabled={busy || continueDisabled} onClick={onContinue}>Continue<ChevronRight className="h-4 w-4 shrink-0 @max-[20rem]:hidden" aria-hidden /></Button> : finalAction}
  </div>;
}
