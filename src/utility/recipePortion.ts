import type { Food, Meal, RecipeIngredient } from "@/types/domain";
import { foodMacros, type DayTotals } from "./nutrition";
import { parseProvidedRecipeNutrition } from "./providedRecipeNutrition";

/** Captures reviewed contents, including ingredient nutrition, without making a draft authoritative. */
export function recipeReviewToken(recipe: Meal, foods: readonly Food[]): string {
  return JSON.stringify([recipe, recipe.ingredients.map(ingredient => foods.find(food => food.id === ingredient.foodId) ?? null)]);
}

export type RecipePortion = { ingredients: RecipeIngredient[]; nutrition: DayTotals; canPlan: boolean; source: string; sourceDetails?: string[] };

export function recipePortion(recipe: Meal | undefined, foods: Food[], servingsText: string, carbLimited = false): RecipePortion | null {
  const amount = Number(servingsText);
  if (!recipe || recipe.archivedAt || !servingsText.trim() || !Number.isFinite(amount) || amount <= 0 ||
    !Number.isFinite(recipe.servings) || recipe.servings <= 0 || !recipe.ingredients.length) return null;
  const ingredients = recipe.ingredients.map(ingredient => ({ ...ingredient, servings: ingredient.servings * amount / recipe.servings }));
  const matched = ingredients.map(ingredient => foods.find(food => food.id === ingredient.foodId));
  if (ingredients.some(ingredient => !Number.isFinite(ingredient.servings) || ingredient.servings <= 0) || matched.some(food => !food)) return null;
  const provided = recipe.providedNutrition ? parseProvidedRecipeNutrition(recipe.providedNutrition) : null;
  if (recipe.providedNutrition && !provided) return null;
  const nutrition = provided
    ? { calories: provided.calories * amount, proteinG: provided.proteinG * amount, carbsG: provided.carbsG * amount, fatG: provided.fatG * amount }
    : ingredients.reduce<DayTotals>((total, ingredient, index) => {
      const values = foodMacros(matched[index]!, ingredient.servings);
      return { calories: total.calories + values.calories, proteinG: total.proteinG + values.proteinG, carbsG: total.carbsG + values.carbsG, fatG: total.fatG + values.fatG };
    }, { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  if (Object.values(nutrition).some(value => !Number.isFinite(value) || value < 0)) return null;
  return {
    ingredients, nutrition,
    canPlan: !matched.some(food => food!.valueSource === "ai_estimate") && (!carbLimited || (!provided && matched.every(food => food!.valueSource === "trusted_catalog"))),
    source: provided ? "Source-provided recipe macros · approximate; not recalculated from ingredients."
      : "Ingredient-based nutrition · approximate.",
    sourceDetails: provided ? ["Original per-serving macros, not independently verified.", recipe.reference ?? "User-provided recipe nutrition"]
      : [...new Set(matched.map(food => `${food!.source} ${food!.sourceVersion}`))],
  };
}
