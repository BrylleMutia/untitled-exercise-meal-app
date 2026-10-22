"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChartNoAxesColumnIncreasing, ChartPie, Clock } from "lucide-react";
import type { RecipeComplexity } from "@/types/domain";
import { complexityLabels } from "@/utility/recipeCard";

export function RecipeResourcePills({ calories, recipeServings, totalTimeMinutes, complexity, compact = false, mobileScrollable = false, id }: {
  calories?: number; recipeServings?: number; totalTimeMinutes?: number; complexity?: RecipeComplexity;
  compact?: boolean; mobileScrollable?: boolean; id?: string;
}) {
  const scroller = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const scrollHintId = useId();
  useEffect(() => {
    const container = scroller.current, row = content.current;
    if (!mobileScrollable || !container || !row) return;
    let active = true;
    const measure = () => {
      if (active) setOverflows(getComputedStyle(container).overflowX === "auto" && container.scrollWidth > container.clientWidth + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container); observer.observe(row);
    void document.fonts.ready.then(measure);
    document.fonts.addEventListener("loadingdone", measure);
    measure();
    return () => { active = false; observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  }, [mobileScrollable]);
  const knownCalories = calories !== undefined && Number.isFinite(calories) && calories >= 0;
  const hasRecipe = recipeServings !== undefined;
  const pill = `inline-flex items-center rounded-full ${mobileScrollable ? "shrink-0 whitespace-nowrap sm:max-w-full sm:shrink sm:whitespace-normal" : "min-w-0 max-w-full"} ${compact ? "gap-1 px-2 py-1" : mobileScrollable ? "gap-1 px-2 py-1 sm:gap-1.5 sm:px-[12px] sm:py-2" : "gap-1.5 px-[12px] py-2"}`;
  const icon = `${compact ? "h-3 w-3" : mobileScrollable ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5"} shrink-0`;
  const contents = <>
    <span className={`${pill} bg-coral-200 tabular-nums`} role="img" aria-label={knownCalories ? `Approximately ${Math.round(calories)} calories per serving` : "Calories unavailable"}><span className="min-w-0">{knownCalories ? `≈${Math.round(calories)} kcal` : "Calories unavailable"}</span></span>
    {hasRecipe ? <span className={`${pill} bg-mint-100 tabular-nums`} role="img" aria-label={`Recipe yields ${recipeServings} ${recipeServings === 1 ? "serving" : "servings"}`}><ChartPie className={icon} aria-hidden /><span>{recipeServings}</span></span> : null}
    <span className={`${pill} bg-lav-100`} role="img" aria-label={totalTimeMinutes === undefined ? "Recipe time not set" : `Total recipe time: ${totalTimeMinutes} minutes`}><Clock className={icon} aria-hidden /><span className="min-w-0">{totalTimeMinutes === undefined ? "Not set" : `${totalTimeMinutes} mins`}</span></span>
    {hasRecipe ? <span className={`${pill} bg-peach-100`} role="img" aria-label={`Recipe complexity: ${complexityLabels[complexity ?? "medium"]}`}><ChartNoAxesColumnIncreasing className={icon} aria-hidden /><span className="min-w-0">{complexityLabels[complexity ?? "medium"]}</span></span> : null}
  </>;
  const spacing = compact ? "gap-1" : mobileScrollable ? "gap-1 py-2 sm:gap-1.5 sm:py-3" : "gap-1.5 py-3";
  const typography = "text-xs font-bold text-ink [overflow-wrap:anywhere]";
  return mobileScrollable ? <span ref={scroller} id={id} role="group" aria-label="Recipe details" aria-describedby={overflows ? scrollHintId : undefined}
    tabIndex={overflows ? 0 : undefined} className="block min-w-0 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lav-500 sm:overflow-visible">
    <span ref={content} className={`flex w-max min-w-full flex-nowrap sm:w-auto sm:min-w-0 sm:flex-wrap ${typography} ${spacing}`}>{contents}</span>
    {overflows ? <span id={scrollHintId} className="sr-only">Scroll horizontally to view all recipe details.</span> : null}
  </span> : <span id={id} className={`flex min-w-0 flex-wrap ${typography} ${spacing}`} role="group" aria-label="Recipe details">{contents}</span>;
}
