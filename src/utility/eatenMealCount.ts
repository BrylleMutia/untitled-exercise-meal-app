import type { LoggedMeal, NutritionLog } from "@/types/domain";

/** Mirrors Eaten rows: a group counts once; unmatched logs remain standalone rows. */
export function eatenMealCount(logs: readonly NutritionLog[], meals: readonly LoggedMeal[], date: string): number {
  const grouped = meals.filter(meal => meal.date === date);
  const groupedIds = new Set(grouped.map(meal => `${meal.slot}:${meal.id}`));
  return grouped.length + logs.filter(log => log.date === date &&
    (!log.loggedMealId || !groupedIds.has(`${log.slot}:${log.loggedMealId}`))).length;
}
