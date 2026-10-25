import type { AppSnapshot, MealSlot, PlannedMeal, RecipeImage } from "@/types/domain";
import { plannedDayNutrition } from "./plannedDayNutrition";

export const mealSlots: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];
export const mealSlotLabels: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
export type DailyMealRow = {
  id: string; slot: MealSlot; name: string; calories: number | null; partial: boolean;
  image?: RecipeImage | null; logged: boolean; planned?: PlannedMeal;
  log?: { kind: "meal" | "nutrition"; id: string; revision?: number };
};

function calorieSummary(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return { calories: known.length ? known.reduce((total, value) => total + value, 0) : null, partial: !values.length || known.length !== values.length };
}

/** Actual records replace their linked prescription once, never add to it. */
export function dailyMealRows(snapshot: AppSnapshot, date: string): DailyMealRow[] {
  const logs = snapshot.nutritionLogs.filter(log => log.date === date);
  const groups = snapshot.loggedMeals.filter(meal => meal.date === date);
  const linked = new Set([...logs, ...groups].flatMap(row => row.plannedMealId ? [row.plannedMealId] : []));
  const recipeImage = (id?: string) => snapshot.savedMeals.find(meal => meal.id === id)?.image;
  const planned: DailyMealRow[] = (snapshot.mealPlan?.meals ?? []).filter(meal => meal.date === date && !meal.skipped && !linked.has(meal.id))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(meal => {
      const nutrition = plannedDayNutrition([meal], date);
      return { id: meal.id, slot: meal.slot, name: meal.label, ...calorieSummary([nutrition.metrics.calories.value]), image: recipeImage(meal.mealId), logged: false, planned: meal };
    });
  const grouped: DailyMealRow[] = groups.map(meal => ({ id: meal.id, slot: meal.slot, name: meal.name,
    ...calorieSummary(logs.filter(log => log.loggedMealId === meal.id).map(log => log.calories)), image: recipeImage(meal.mealId), logged: true,
    log: { kind: "meal", id: meal.id, revision: meal.revision } }));
  const groupIds = new Set(groups.map(meal => meal.id));
  const standalone: DailyMealRow[] = logs.filter(log => !log.loggedMealId || !groupIds.has(log.loggedMealId)).map(log => ({
    id: log.id, slot: log.slot, name: log.customName ?? snapshot.foods.find(food => food.id === log.foodId)?.name ?? "Saved food",
    ...calorieSummary([log.calories]), logged: true, log: { kind: "nutrition", id: log.id, revision: log.revision },
  }));
  return [...planned, ...grouped, ...standalone].sort((a, b) => mealSlots.indexOf(a.slot) - mealSlots.indexOf(b.slot));
}

export function slotCalorieLabel(rows: DailyMealRow[]): string | null {
  if (!rows.length) return null;
  const known = rows.filter(row => row.calories !== null);
  if (!known.length) return "Calories unavailable";
  const total = Math.round(known.reduce((sum, row) => sum + row.calories!, 0));
  return `${rows.some(row => row.partial) || known.length !== rows.length ? "Partial · " : ""}≈${total} kcal`;
}
