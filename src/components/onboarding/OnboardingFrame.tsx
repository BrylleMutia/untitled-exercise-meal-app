"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";

interface OnboardingFrameProps {
  header: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  stepKey: number;
}

export function OnboardingFrame({ header, children, footer, stepKey }: OnboardingFrameProps) {
  const frame = useRef<HTMLDivElement>(null);
  const scrollport = useRef<HTMLDivElement>(null);
  const headerPort = useRef<HTMLElement>(null);
  const footerPort = useRef<HTMLElement>(null);

  function revealFocusedField() {
    const port = scrollport.current;
    const active = document.activeElement;
    if (!port || !(active instanceof HTMLElement) || active === port || !port.contains(active)) return;
    const bounds = port.getBoundingClientRect();
    const choiceId = active.getAttribute("aria-activedescendant");
    const choice = choiceId ? document.getElementById(choiceId) : null;
    const field = (choice && active.contains(choice) ? choice : active).getBoundingClientRect();
    const inset = Math.min(8, Math.max(0, (bounds.height - field.height) / 2));
    const top = bounds.top + inset;
    const bottom = bounds.bottom - inset;
    if (field.top < top || field.height > bottom - top) port.scrollTop += field.top - top;
    else if (field.bottom > bottom) port.scrollTop += field.bottom - bottom;
  }

  useLayoutEffect(() => {
    for (const port of [scrollport.current, headerPort.current, footerPort.current]) {
      port?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [stepKey]);

  useEffect(() => {
    const element = frame.current;
    const viewport = window.visualViewport;
    if (!element || !viewport) return;
    let animation: number | null = null;
    function update() {
      animation = null;
      // A keyboard changes the visual viewport independently of 100dvh on mobile.
      // Pinch zoom must remain free to pan the existing layout instead of resizing it.
      if (!element || !viewport || Math.abs(viewport.scale - 1) > 0.01) return;
      element.style.setProperty("--onboarding-height", `${viewport.height}px`);
      element.style.setProperty("--onboarding-top", `${viewport.offsetTop}px`);
      revealFocusedField();
    }
    function schedule() {
      if (animation === null) animation = requestAnimationFrame(update);
    }
    update();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (animation !== null) cancelAnimationFrame(animation);
    };
  }, []);

  return <div ref={frame} className="onboarding-frame fixed inset-x-0 mx-auto grid w-full max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] gap-4 px-4" data-onboarding-frame>
    <header ref={headerPort} className="onboarding-frame-header -mx-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain p-1" data-onboarding-header>{header}</header>
    <Card className="grid min-h-0 max-h-full self-start grid-rows-[minmax(0,1fr)] overflow-hidden !p-0" data-onboarding-card>
      <div ref={scrollport} role="region" aria-label="Onboarding form" tabIndex={0}
        className="onboarding-scroll min-h-0 min-w-0 overflow-y-auto overscroll-contain rounded-3xl focus-visible:-outline-offset-4"
        onFocusCapture={revealFocusedField} data-onboarding-scroll>
        <div className="grid min-w-0 content-start gap-5 p-5">{children}</div>
      </div>
    </Card>
    <footer ref={footerPort} className="onboarding-frame-footer -mx-1 grid min-h-0 min-w-0 gap-2 overflow-y-auto overscroll-contain p-1" data-onboarding-footer>{footer}</footer>
  </div>;
}
