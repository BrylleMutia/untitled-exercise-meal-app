import type { PlannedMeal } from "@/types/domain";

const fields = { calories: "expectedCalories", proteinG: "expectedProteinG", carbsG: "expectedCarbsG", fatG: "expectedFatG" } as const;
export type PlannedMetric = keyof typeof fields;
export type PlannedDayNutrition = {
  mealCount: number;
  skippedCount: number;
  affectedMeals: number;
  metrics: Record<PlannedMetric, { value: number | null; missingCount: number }>;
};

/** Prescription values already describe the planned portion; never scale twice. */
export function plannedDayNutrition(meals: PlannedMeal[], date: string): PlannedDayNutrition {
  const day = meals.filter(meal => meal.date === date);
  const active = day.filter(meal => !meal.skipped);
  const valid = (meal: PlannedMeal, metric: PlannedMetric) => {
    const value = meal[fields[metric]];
    return Boolean((meal.mealId || meal.foodId || meal.source) && Number.isFinite(meal.servings) && meal.servings > 0
      && typeof value === "number" && Number.isFinite(value) && value >= 0);
  };
  const keys = Object.keys(fields) as PlannedMetric[];
  return {
    mealCount: active.length,
    skippedCount: day.length - active.length,
    affectedMeals: active.filter(meal => keys.some(metric => !valid(meal, metric))).length,
    metrics: Object.fromEntries(keys.map(metric => {
      const known = active.filter(meal => valid(meal, metric));
      return [metric, { value: known.length ? known.reduce((sum, meal) => sum + meal[fields[metric]]!, 0) : null, missingCount: active.length - known.length }];
    })) as PlannedDayNutrition["metrics"],
  };
}
