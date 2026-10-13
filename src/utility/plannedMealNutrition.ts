import type { Food, Meal, PlannedMeal } from "@/types/domain";
import { mealNutrition, type DayTotals } from "./nutrition";

// Stored prescription values lead; legacy rows can use a fully resolved reference.
export function plannedMealNutrition(planned: PlannedMeal, meals: Meal[], foods: Food[]): DayTotals | null {
  if (!Number.isFinite(planned.servings) || planned.servings <= 0) return null;
  const recipe = planned.mealId ? meals.find(meal => meal.id === planned.mealId) : undefined;
  const food = planned.foodId ? foods.find(item => item.id === planned.foodId) : undefined;
  const recipeKnown = recipe && (recipe.providedNutrition || (recipe.ingredients.length > 0 && recipe.ingredients.every(item => foods.some(food => food.id === item.foodId))));
  const perServing = recipeKnown ? mealNutrition(recipe, foods).perServing : food;
  if (!perServing) return null;
  const value = (stored: number | undefined, current: number) => stored !== undefined ? stored : current * planned.servings;
  return {
    calories: value(planned.expectedCalories, perServing.calories),
    proteinG: value(planned.expectedProteinG, perServing.proteinG),
    carbsG: value(planned.expectedCarbsG, perServing.carbsG),
    fatG: value(planned.expectedFatG, perServing.fatG),
  };
}
