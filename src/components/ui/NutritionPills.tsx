"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { nutritionMetricOrder, nutritionMetricStyles, type NutritionMetric } from "./nutritionMetrics";

type NutritionPillsProps = {
  values: Partial<Record<NutritionMetric, number | null>>;
  approximate?: boolean;
  precision?: number;
  label?: string;
  className?: string;
  nullLabel?: "not logged" | "unavailable";
  abbreviateOnMobile?: boolean;
  compactOnMobile?: boolean;
  scrollable?: boolean;
};

export function NutritionPills({ values, approximate = false, precision, label = "Nutrition summary", className = "", nullLabel = "not logged", abbreviateOnMobile = false, compactOnMobile = false, scrollable = false }: NutritionPillsProps) {
  const scroller = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);
  const hintId = useId();
  useEffect(() => {
    const container = scroller.current, row = content.current;
    if (!scrollable || !container || !row) return;
    let active = true;
    const measure = () => { if (active) setOverflows(container.scrollWidth > container.clientWidth + 1); };
    const observer = new ResizeObserver(measure);
    observer.observe(container); observer.observe(row);
    void document.fonts.ready.then(measure);
    document.fonts.addEventListener("loadingdone", measure);
    measure();
    return () => { active = false; observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  }, [scrollable]);
  const pills = <>
      {nutritionMetricOrder.filter((metric) => values[metric] !== undefined).map((metric) => {
        const style = nutritionMetricStyles[metric];
        const value = values[metric];
        const known = typeof value === "number" && Number.isFinite(value) && value >= 0;
        const display = known ? precision === undefined ? value : Number(value.toFixed(precision)) : null;
        const fullText = display === null ? `${style.label} ${value === null ? nullLabel : "unavailable"}` : `${approximate ? "≈" : ""}${display} ${style.unit}`;
        return (
          <span key={metric} data-nutrition-metric={metric} className={`inline-flex ${scrollable ? "shrink-0 whitespace-nowrap" : "max-w-full [overflow-wrap:anywhere]"} items-center rounded-full px-2.5 py-1 text-xs font-bold leading-5 text-ink tabular-nums ${compactOnMobile ? "max-sm:px-2 max-sm:leading-4" : ""} ${style.pill}`}>
            {abbreviateOnMobile && display !== null && metric !== "calories" ? <>
              <span className="sm:hidden" aria-hidden="true">{`${style.label[0]} ${approximate ? "≈" : ""}${display}g`}</span>
              <span className="hidden sm:inline" aria-hidden="true">{fullText}</span>
              <span className="sr-only">{`${style.label}: ${approximate ? "approximately " : ""}${display} grams`}</span>
            </> : fullText}
          </span>
        );
      })}
  </>;
  const gap = `gap-1.5 ${compactOnMobile ? "max-sm:gap-1" : ""}`;
  return scrollable ? <span ref={scroller} role="group" aria-label={label} aria-describedby={overflows ? hintId : undefined} tabIndex={overflows ? 0 : undefined}
    onKeyDown={event => {
      if (event.key !== "Home" && event.key !== "End") return;
      event.preventDefault();
      event.currentTarget.scrollLeft = event.key === "Home" ? 0 : event.currentTarget.scrollWidth;
    }}
    className={`relative block min-w-0 max-w-full overflow-x-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lav-500 ${className}`}>
    <span ref={content} data-nutrition-strip className={`flex w-max min-w-full flex-nowrap ${gap}`}>{pills}</span>
    {overflows ? <span id={hintId} className="sr-only">Scroll horizontally to view all nutrition values.</span> : null}
  </span> : <span role="group" aria-label={label} className={`flex min-w-0 flex-wrap ${gap} ${className}`}>{pills}</span>;
}

export function NutritionFieldLabel({ metric, children }: { metric: NutritionMetric | "fiberG"; children: ReactNode }) {
  const style = metric === "fiberG" ? null : nutritionMetricStyles[metric];
  return <label className="grid min-w-0 gap-1 text-xs font-bold text-ink">
    <span className={`w-fit rounded-full px-2 py-1 ${style?.pill ?? "bg-cream"}`}>{style?.label ?? "Fiber"}{metric === "calories" ? " (kcal)" : " (g)"}</span>
    {children}
  </label>;
}
