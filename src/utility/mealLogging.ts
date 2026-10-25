import type { AppActions } from "@/contexts/AppContext";
import type { AppSnapshot, Food, Meal, MealSlot, PlannedMeal } from "@/types/domain";
import type { CandidateServingPlan } from "./textMeal";
import { foodMacros } from "./nutrition";
import { parseProvidedRecipeNutrition, providedRecipeLogEntry } from "./providedRecipeNutrition";
export function clientId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
export function plannedLogAvailable(meal: PlannedMeal, snapshot: AppSnapshot) {
  if (!Number.isFinite(meal.servings) || meal.servings <= 0 || meal.skipped) return false;
  const usableFood = (id: string) => {
    const food = snapshot.foods.find(food => food.id === id);
    return Boolean(food && Object.values(foodMacros(food, 1)).every(value => Number.isFinite(value) && value >= 0));
  };
  if (meal.foodId) return usableFood(meal.foodId);
  const recipe = snapshot.savedMeals.find(recipe => recipe.id === meal.mealId);
  if (!recipe || !Number.isFinite(recipe.servings) || recipe.servings <= 0) return false;
  if (recipe.providedNutrition) return Boolean(parseProvidedRecipeNutrition(recipe.providedNutrition));
  return recipe.ingredients.length > 0 && recipe.ingredients.every(item => Number.isFinite(item.servings) && item.servings > 0 && usableFood(item.foodId));
}
export async function addFood(
  actions: AppActions,
  slot: MealSlot,
  date: string,
  food: Food,
  serving: number | CandidateServingPlan,
  plannedMealId?: string,
  fixedKey?: string,
  singlePlannedPortion = false,
) {
  const servings = typeof serving === "number" ? serving : serving.servings;
  const macros = foodMacros(food, servings);
  return actions.logNutrition({
    date,
    slot,
    foodId: food.id,
    ...(plannedMealId ? { plannedMealId } : {}),
    servings,
    servingQuantity: typeof serving === "number"
      ? food.unit === "piece" ? servings : food.servingGrams * servings
      : serving.servingQuantity,
    servingUnit: typeof serving === "number" ? food.unit : serving.servingUnit,
    calories: macros.calories,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
    ...(food.fiberG === undefined ? {} : { fiberG: Math.round(food.fiberG * servings * 10) / 10 }),
    estimated: food.estimated,
    confidence: food.confidence,
    source: `${food.source} ${food.sourceVersion}`,
    sourceVersion: food.sourceVersion,
    valueSource: food.valueSource,
    ...(food.estimateRange ? { estimateRange: food.estimateRange } : {}),
    preparationBasis: food.preparationBasis ?? "as_labeled",
  }, fixedKey, undefined, singlePlannedPortion);
}

export async function logMeal(
  actions: AppActions,
  ingredients: { foodId: string; servings: number }[],
  date: string,
  slot: MealSlot,
  meal: Meal,
  foods: Food[],
  plannedMealId?: string,
  fixedKey?: string,
  servingsOverride?: number,
) {
  if (!meal.providedNutrition && (!ingredients.length || ingredients.some(ingredient => !Number.isFinite(ingredient.servings) || ingredient.servings <= 0 || !foods.some(food => food.id === ingredient.foodId)))) return false;
  const recipeServings = servingsOverride ?? (ingredients[0] && meal.ingredients[0] ? ingredients[0].servings / meal.ingredients[0].servings * meal.servings : meal.servings);
  const providedEntry = providedRecipeLogEntry(meal, recipeServings, date, slot);
  if (meal.providedNutrition && !providedEntry) return false;
  const entries: Parameters<typeof actions.logSavedMeal>[2] = providedEntry ? [providedEntry] : [];
  for (const ing of providedEntry ? [] : ingredients) {
    const food = foods.find((f) => f.id === ing.foodId);
    if (!food) continue;
    const macros = foodMacros(food, ing.servings);
    entries.push({
      date,
      slot,
      foodId: food.id,
      servings: ing.servings,
      servingQuantity: food.unit === "piece" ? ing.servings : food.servingGrams * ing.servings,
      servingUnit: food.unit,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      ...(food.fiberG === undefined ? {} : { fiberG: Math.round(food.fiberG * ing.servings * 10) / 10 }),
      estimated: food.estimated,
      confidence: food.confidence,
      source: `${food.source} ${food.sourceVersion}`,
      sourceVersion: food.sourceVersion,
      preparationBasis: food.preparationBasis ?? "as_labeled",
      valueSource: food.valueSource,
    });
  }
  if (plannedMealId) {
    return actions.saveReviewedMeal({
      date,
      slot,
      name: meal.name,
      sourceMode: "saved_meal",
      recipeServings,
      meal,
      ingredients: entries,
      plannedMealId,
      ...(servingsOverride !== undefined ? { singlePlannedPortion: true } : {}),
    }, fixedKey);
  }
  return actions.logSavedMeal(date, slot, entries, meal, fixedKey, recipeServings);
}
