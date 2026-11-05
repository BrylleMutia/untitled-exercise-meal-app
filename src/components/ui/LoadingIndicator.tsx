"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { LottieArtwork, LottiePoster, useReducedAnimationMotion } from "./LottieArtwork";
import { animationAssets } from "@/lib/lottieRuntime";

export const loadingAssets = { animation: animationAssets.pan, poster: animationAssets.panPoster, wasm: animationAssets.wasm };

export function LoadingIndicator({ label, mode = "auto", fallback, className = "" }: {
  label: string;
  mode?: "auto" | "compact";
  fallback?: ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const [visible, setVisible] = useState(false);
  const [appeared, setAppeared] = useState(false);
  const reduced = useReducedAnimationMotion();
  useEffect(() => {
    if (mode === "compact" || !root.current) return;
    if (!("ResizeObserver" in window) || !("IntersectionObserver" in window)) return;
    const element = root.current;
    let active = true;
    const resize = new ResizeObserver(entries => { if (active) setWide(entries[0].contentRect.width >= 240); });
    resize.observe(element);
    let intersects = false;
    const updateVisibility = () => {
      if (!active) return;
      const shown = intersects && document.visibilityState !== "hidden";
      setVisible(shown);
      if (shown) setAppeared(true);
    };
    const intersection = new IntersectionObserver(entries => { intersects = entries[0].isIntersecting; updateVisibility(); });
    intersection.observe(element);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => { active = false; resize.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", updateVisibility); };
  }, [mode]);
  const spacious = mode === "auto" && wide;
  return <div ref={root} role="status" aria-live="polite" aria-atomic="true" data-loading-indicator data-loading-layout={spacious ? "pan" : "compact"}
    className={`min-w-0 w-full ${spacious ? "grid justify-items-center gap-2 py-3 text-center" : "flex items-center gap-2"} ${className}`}>
    {spacious ? <span className="relative block h-[96px] w-[96px] shrink-0" aria-hidden="true">
      {!reduced && appeared ? <LottieArtwork src={loadingAssets.animation} poster={loadingAssets.poster} playing={visible} loop /> : <LottiePoster src={loadingAssets.poster} />}
    </span> : <span className="shrink-0" aria-hidden="true">{fallback ?? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />}</span>}
    <span className="min-w-0 text-sm font-semibold text-ink-soft [overflow-wrap:anywhere]">{label}</span>
  </div>;
}
