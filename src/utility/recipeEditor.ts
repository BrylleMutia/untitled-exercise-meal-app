import type { Food, Meal } from "@/types/domain";
import type { NutritionProviderCandidate } from "@/services/nutritionProvider";
import { mealNutrition } from "./nutrition";
import { normalizeNutritionUnit, servingPlanForCandidate } from "./textMeal";

export type RecipeIngredientDraft = { id: string; name: string; food: Food | null; quantity: string; unit: string; included: boolean; assumptions: string[] };

export type RecipeIngredientMethod = "search" | "describe" | "custom";

export function recipeServingsControl(value: string) {
  const blank = !value.trim();
  const count = Number(value);
  const valid = Number.isFinite(count) && count >= 0 && count <= 10000;
  return {
    minusDisabled: blank || !valid || count === 0,
    plusDisabled: !blank && (!valid || count >= 10000),
    decrement: valid ? String(Number(Math.max(0, count - 1).toFixed(10))) : value,
    increment: blank ? "1" : valid ? String(Number(Math.min(10000, count + 1).toFixed(10))) : value,
  };
}

export function recipeMethodPrefill(
  fields: { query: string; description: string; customName: string },
  from: RecipeIngredientMethod, to: RecipeIngredientMethod,
): { field: "query" | "description" | "customName"; value: string } | null {
  const keys = { search: "query", describe: "description", custom: "customName" } as const;
  const field = keys[to];
  const source = fields[keys[from]];
  if (from === to || fields[field].trim() || !source.trim()) return null;
  return { field, value: source.slice(0, field === "description" ? 4000 : field === "customName" ? 256 : 180) };
}

export function recipeServingPlan(food: Food, quantity: number, requestedUnit: string) {
  const unit = normalizeNutritionUnit(requestedUnit);
  if (!unit) return null;
  const option = food.servingOptions?.find(candidate => normalizeNutritionUnit(candidate.unit) === unit);
  if (option && (!Number.isFinite(option.grams) || option.grams <= 0)) return null;
  // A label containing "ml" or "cup" is not a conversion factor. Only an
  // explicit serving option or the canonical unit can authorize conversion.
  return servingPlanForCandidate({ ...food, servingLabel: "", servingOptions: option ? [option] : [] }, quantity, unit);
}

export function recipePreview(ingredients: RecipeIngredientDraft[], servings: string, foods: Food[]) {
  if (!servings.trim() || !Number.isFinite(Number(servings)) || Number(servings) < 0.0001 || Number(servings) > 10000 || !ingredients.length) return null;
  const refs: Meal["ingredients"] = [];
  const sources = [...foods];
  for (const item of ingredients) {
    const food = foods.find((candidate) => candidate.id === item.food?.id) ?? item.food;
    const serving = food && item.quantity.trim() ? recipeServingPlan(food, Number(item.quantity), item.unit) : null;
    if (!food || !serving || serving.servings < 0.0001 || serving.servings > 10000 || food.valueSource === "ai_estimate") return null;
    sources.push(food);
    refs.push({ foodId: food.id, servings: serving.servings });
  }
  const meal: Meal = { id: "preview", name: "preview", servings: Number(servings), ingredients: refs };
  return { ingredients: refs, perServing: mealNutrition(meal, sources).perServing };
}

export function providerCandidateFood(candidate: NutritionProviderCandidate): Food {
  return { ...candidate, id: `food-fdc-${candidate.fdcId}`, category: "Other", valueSource: "trusted_catalog" };
}

export function safeRecipeReference(reference?: string): string | null {
  if (!reference?.trim()) return null;
  try { const url = new URL(reference.trim()); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
