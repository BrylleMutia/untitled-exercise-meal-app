"use client";

import { useEffect, useRef, useState } from "react";
import { LottieArtwork, LottiePoster, useReducedAnimationMotion } from "@/components/ui/LottieArtwork";
import { animationAssets } from "@/lib/lottieRuntime";

export function GenerationSuccessAnimation() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedAnimationMotion();
  const [visible, setVisible] = useState(false);
  const [appeared, setAppeared] = useState(false);
  useEffect(() => {
    if (!root.current || !("IntersectionObserver" in window)) return;
    let active = true, intersects = false;
    const update = () => {
      if (!active) return;
      const shown = intersects && document.visibilityState !== "hidden";
      setVisible(shown);
      if (shown) setAppeared(true);
    };
    const observer = new IntersectionObserver(entries => { intersects = entries[0].isIntersecting; update(); });
    observer.observe(root.current);
    document.addEventListener("visibilitychange", update);
    return () => { active = false; observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  return <div ref={root} aria-hidden="true" data-generation-success-animation className="relative mx-auto mb-3 h-[88px] w-[160px] max-w-full overflow-hidden">
    <div className="absolute left-1/2 top-1/2 h-[192px] w-[192px] -translate-x-1/2 -translate-y-1/2">
      {!reduced && appeared ? <LottieArtwork src={animationAssets.check} poster={animationAssets.checkPoster} playing={visible} /> : <LottiePoster src={animationAssets.checkPoster} />}
    </div>
  </div>;
}
