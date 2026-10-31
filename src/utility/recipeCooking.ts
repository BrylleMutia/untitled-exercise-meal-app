import type { CookingIngredient, Food, Meal, RecipeNutritionInput } from "@/types/domain";
import { parseCookingMeasurement } from "./cookingMeasurement";
import { parseProvidedRecipeNutrition, providedNutritionKeys } from "./providedRecipeNutrition";

export function parseCookingIngredients(value: unknown): CookingIngredient[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => !["id", "foodId", "nutritionServings", "cookingMeasurement"].includes(key)) || typeof item.id !== "string" || !item.id.trim() || item.id.length > 128 || ids.has(item.id) || !parseCookingMeasurement(item.cookingMeasurement) || !item.cookingMeasurement.name?.trim()) return null;
    if (item.foodId !== undefined && (typeof item.foodId !== "string" || !item.foodId.trim() || item.foodId.length > 128)) return null;
    if (item.nutritionServings !== undefined && (!item.foodId || typeof item.nutritionServings !== "number" || !Number.isFinite(item.nutritionServings) || item.nutritionServings < 0.0001 || item.nutritionServings > 10000)) return null;
    ids.add(item.id);
  }
  return value as CookingIngredient[];
}

export function parseRecipeNutritionInput(value: unknown): RecipeNutritionInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !["method", "basis", "values"].includes(key)) || !["provided", "ingredients"].includes(String(item.method)) || !["per-serving", "whole-recipe"].includes(String(item.basis))) return null;
  // Whole-recipe values may exceed the per-serving limits; normalization validates those.
  if (item.values !== undefined && (!item.values || typeof item.values !== "object" || Object.keys(item.values).some(key => !providedNutritionKeys.includes(key as typeof providedNutritionKeys[number])) || !providedNutritionKeys.every(key => typeof (item.values as Record<string, unknown>)[key] === "number" && Number.isFinite((item.values as Record<string, number>)[key]) && (item.values as Record<string, number>)[key] >= 0 && (item.values as Record<string, number>)[key] <= 100000000))) return null;
  if (item.method === "provided" && !item.values) return null;
  return item as unknown as RecipeNutritionInput;
}

export function normalizedRecipeNutrition(input: RecipeNutritionInput, yieldCount: number) {
  if (input.method !== "provided" || !input.values || !Number.isInteger(yieldCount) || yieldCount < 1 || yieldCount > 10000) return null;
  return parseProvidedRecipeNutrition(Object.fromEntries(providedNutritionKeys.map(key => [key, input.values![key] / (input.basis === "whole-recipe" ? yieldCount : 1)])));
}

export function recipeCookingIngredients(meal: Meal, foods: readonly Food[]): CookingIngredient[] {
  if (meal.cookingIngredients) return meal.cookingIngredients;
  return meal.ingredients.map((ingredient, index) => {
    const food = foods.find(item => item.id === ingredient.foodId);
    return { id: `legacy-${index + 1}`, foodId: ingredient.foodId, nutritionServings: ingredient.servings,
      cookingMeasurement: { ...(ingredient.cookingMeasurement ?? (!food ? { kind: "unmeasured" as const, text: "Original cooking quantity unavailable" } : { kind: "amount", quantity: ingredient.servings * (food?.unit === "piece" ? 1 : food?.servingGrams ?? 1), unit: food.unit === "piece" ? "piece" : "g" })), name: ingredient.cookingMeasurement?.name ?? food?.name ?? "Ingredient" } };
  });
}
