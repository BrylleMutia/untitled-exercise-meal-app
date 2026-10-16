import type { Food, LoggedMeal, Meal, NutritionLog } from "@/types/domain";

export function positiveRecipeServings(text: string): number | null {
  const value = Number(text);
  return text.trim() && Number.isFinite(value) && value > 0 && value <= 10000 ? value : null;
}

/** Legacy recovery never uses a partial ingredient match or nutrition ratios. */
export function loggedRecipeServings(meal: LoggedMeal, entries: NutritionLog[], recipe?: Meal, foods: Food[] = []): number | null {
  if (meal.recipeServings !== undefined) return positiveRecipeServings(String(meal.recipeServings));
  if (meal.sourceMode !== "saved_meal" || !entries.length) return null;
  if (entries.length === 1) {
    const entry = entries[0];
    const food = foods.find(food => food.id === entry.foodId);
    if (food?.servingLabel === "1 recipe serving" && entry.sourceVersion?.startsWith(`recipe:${meal.mealId}:revision:`)) {
      return positiveRecipeServings(String(entry.servings));
    }
  }
  if (!recipe || !recipe.ingredients.length || !Number.isFinite(recipe.servings) || recipe.servings <= 0) return null;
  const original = new Map<string, number>(), eaten = new Map<string, number>();
  for (const item of recipe.ingredients) {
    if (!Number.isFinite(item.servings) || item.servings <= 0) return null;
    original.set(item.foodId, (original.get(item.foodId) ?? 0) + item.servings);
  }
  for (const entry of entries) {
    if (!entry.foodId || !Number.isFinite(entry.servings) || entry.servings <= 0) return null;
    eaten.set(entry.foodId, (eaten.get(entry.foodId) ?? 0) + entry.servings);
  }
  if (original.size !== eaten.size) return null;
  const ratios = [...original].map(([id, quantity]) => eaten.has(id) ? eaten.get(id)! / quantity : NaN);
  if (ratios.some(value => !Number.isFinite(value)) || Math.max(...ratios) - Math.min(...ratios) > 0.000001) return null;
  // Remove binary floating-point noise in the input; calculations retain precision.
  return positiveRecipeServings(String(Number((Math.min(...ratios) * recipe.servings).toPrecision(12))));
}

export function loggedRecipePortion(entries: NutritionLog[], previous: number | null, next: number | null) {
  if (!entries.length || previous === null || next === null) return null;
  const ratio = next / previous;
  const values = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const entry of entries) for (const metric of Object.keys(values) as Array<keyof typeof values>) {
    if (!Number.isFinite(entry[metric]) || entry[metric] < 0) return null;
    values[metric] += entry[metric] * ratio;
  }
  return values;
}
