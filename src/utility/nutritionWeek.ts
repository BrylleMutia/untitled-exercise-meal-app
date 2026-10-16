import type { AppSnapshot } from "@/types/domain";
import type { NutritionWeekReadModel } from "@/types/backend";

/** Presentation/mutation context only; never replaces the global current-week cache. */
export function nutritionWeekSnapshot(snapshot: AppSnapshot, week?: NutritionWeekReadModel): AppSnapshot {
  if (!week) return snapshot;
  const recipes = new Map(snapshot.savedMeals.map(meal => [meal.id, meal]));
  for (const meal of week.recipes) if (!recipes.has(meal.id)) recipes.set(meal.id, { ...meal, archivedAt: meal.archivedAt ?? "reference-only" });
  const foods = new Map(week.foods.map(food => [food.id, food]));
  for (const food of snapshot.foods) foods.set(food.id, food);
  return { ...snapshot, mealPlan: week.mealPlan, grocery: week.grocery, nutritionWeekTargets: week.targets,
    nutritionLogs: week.nutritionLogs, loggedMeals: week.loggedMeals, savedMeals: [...recipes.values()], foods: [...foods.values()] };
}
