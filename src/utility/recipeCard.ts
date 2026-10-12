import type { Food, Meal, RecipeComplexity } from "@/types/domain";
import { mealNutrition } from "./nutrition";

export const complexityLabels: Record<RecipeComplexity, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
export function isRecipeComplexity(value: unknown): value is RecipeComplexity {
  return value === "easy" || value === "medium" || value === "hard";
}
export function defaultRecipeComplexity(value: string | null | undefined): string {
  return value === undefined || value === null || !value.trim() ? "medium" : value;
}
export function recipeCardCalories(meal: Meal, foods: Food[]): number | undefined {
  if (!Number.isFinite(meal.servings) || meal.servings <= 0 || !meal.ingredients.length ||
    !meal.ingredients.every(item => Number.isFinite(item.servings) && item.servings > 0 && foods.some(food => food.id === item.foodId))) return undefined;
  const calories = mealNutrition(meal, foods).perServing.calories;
  return Number.isFinite(calories) && calories >= 0 ? calories : undefined;
}
export function recipeBadge(metadata?: { favorite: boolean; popularRank?: number }): "Popular" | "Favorite" | null {
  return metadata?.popularRank ? "Popular" : metadata?.favorite ? "Favorite" : null;
}
