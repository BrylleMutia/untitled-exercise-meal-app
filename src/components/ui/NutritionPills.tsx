import type { ReactNode } from "react";
import { nutritionMetricOrder, nutritionMetricStyles, type NutritionMetric } from "./nutritionMetrics";

type NutritionPillsProps = {
  values: Partial<Record<NutritionMetric, number | null>>;
  approximate?: boolean;
  precision?: number;
  label?: string;
  className?: string;
};

export function NutritionPills({ values, approximate = false, precision, label = "Nutrition summary", className = "" }: NutritionPillsProps) {
  return (
    <span role="group" aria-label={label} className={`flex min-w-0 flex-wrap gap-1.5 ${className}`}>
      {nutritionMetricOrder.filter((metric) => values[metric] !== undefined).map((metric) => {
        const style = nutritionMetricStyles[metric];
        const value = values[metric];
        const known = typeof value === "number" && Number.isFinite(value) && value >= 0;
        const display = known ? precision === undefined ? value : Number(value.toFixed(precision)) : null;
        return (
          <span key={metric} data-nutrition-metric={metric} className={`inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-bold leading-5 text-ink tabular-nums [overflow-wrap:anywhere] ${style.pill}`}>
            {display === null ? `${style.label} ${value === null ? "not logged" : "unavailable"}` : `${approximate ? "≈" : ""}${display} ${style.unit}`}
          </span>
        );
      })}
    </span>
  );
}

export function NutritionFieldLabel({ metric, children }: { metric: NutritionMetric | "fiberG"; children: ReactNode }) {
  const style = metric === "fiberG" ? null : nutritionMetricStyles[metric];
  return <label className="grid min-w-0 gap-1 text-xs font-bold text-ink">
    <span className={`w-fit rounded-full px-2 py-1 ${style?.pill ?? "bg-cream"}`}>{style?.label ?? "Fiber"}{metric === "calories" ? " (kcal)" : " (g)"}</span>
    {children}
  </label>;
}
