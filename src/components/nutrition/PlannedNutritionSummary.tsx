import type { ReactNode } from "react";
import type { DailyTarget } from "@/types/domain";
import type { PlannedDayNutrition } from "@/utility/plannedDayNutrition";
import { DailyNutritionSummary } from "./DailyNutritionSummary";

export function PlannedNutritionSummary({ summary, target, heading = "Today", help }: {
  summary: PlannedDayNutrition; target: DailyTarget | null; heading?: string; help?: ReactNode;
}) {
  const calories = summary.metrics.calories;
  const empty = summary.mealCount === 0;
  return <div role="region" aria-label="Planned daily nutrition">
    <DailyNutritionSummary heading={heading} help={help} target={target}
      context={<>
        <p>{empty ? summary.skippedCount ? "No active meals planned." : "No meals planned."
          : `${summary.mealCount} ${summary.mealCount === 1 ? "meal" : "meals"} planned${summary.skippedCount ? ` · ${summary.skippedCount} skipped` : ""}`}</p>
        {summary.affectedMeals ? <p role="status">Partial total · nutrition unavailable for {summary.affectedMeals} {summary.affectedMeals === 1 ? "meal" : "meals"}.</p> : null}
      </>}
      ring={{ target: target?.calories ?? null, logged: calories.value ?? 0, mode: "planned", estimated: true,
        status: empty ? "unlogged" : calories.value === null || calories.missingCount > 0 ? "partial" : "complete" }}
      calories={!empty ? <>{calories.value === null ? "Planned: Unavailable" : `${Math.round(calories.value)} kcal planned${calories.missingCount ? " · Partial total" : ""}`}
        {target ? ` · Target: ${Math.round(target.calories)} kcal` : ""}</> : null}
      metrics={{
        proteinG: { value: summary.metrics.proteinG.value, partial: summary.metrics.proteinG.missingCount > 0 },
        carbsG: { value: summary.metrics.carbsG.value, partial: summary.metrics.carbsG.missingCount > 0 },
        fatG: { value: summary.metrics.fatG.value, partial: summary.metrics.fatG.missingCount > 0 },
      }} />
  </div>;
}
