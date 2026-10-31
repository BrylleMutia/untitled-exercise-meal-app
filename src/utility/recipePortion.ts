import type { CookingIngredient, Food, Meal, RecipeIngredient } from "@/types/domain";
import { foodMacros, type DayTotals } from "./nutrition";
import { parseProvidedRecipeNutrition } from "./providedRecipeNutrition";

/** Captures reviewed contents, including ingredient nutrition, without making a draft authoritative. */
export function recipeReviewToken(recipe: Meal, foods: readonly Food[]): string {
  return JSON.stringify([recipe, recipe.ingredients.map(ingredient => foods.find(food => food.id === ingredient.foodId) ?? null)]);
}

/** Import timestamps and object-key order do not change a food's displayed assessment. */
export function foodReviewToken(food: Food): string {
  return JSON.stringify([food.id, food.name, food.servingLabel, food.servingGrams, food.unit,
    food.calories, food.proteinG, food.carbsG, food.fatG, food.fiberG, food.source, food.sourceVersion,
    food.valueSource, food.confidence, food.estimated, food.preparationBasis,
    food.servingOptions?.map(option => [option.label, option.unit, option.grams]),
    (["calories", "proteinG", "carbsG", "fatG", "fiberG"] as const).map(key => {
      const range = food.estimateRange?.[key]; return range ? [range.low, range.base, range.high] : null;
    })]);
}

export type RecipePortion = { ingredients: RecipeIngredient[]; cookingIngredients?: CookingIngredient[]; nutrition: DayTotals; source: string; sourceDetails?: string[] };

export function recipePortion(recipe: Meal | undefined, foods: Food[], servingsText: string): RecipePortion | null {
  const amount = Number(servingsText);
  if (!recipe || recipe.archivedAt || !servingsText.trim() || !Number.isFinite(amount) || amount < 0.0001 || amount > 10000 ||
    !Number.isFinite(recipe.servings) || recipe.servings <= 0 || !recipe.providedNutrition && !recipe.ingredients.length) return null;
  const ingredients = recipe.ingredients.map(ingredient => ({ ...ingredient, servings: ingredient.servings * amount / recipe.servings }));
  const matched = ingredients.map(ingredient => foods.find(food => food.id === ingredient.foodId));
  if (ingredients.some(ingredient => !Number.isFinite(ingredient.servings) || ingredient.servings <= 0) || matched.some(food => !food)) return null;
  if (!recipe.providedNutrition && matched.some(food => ![food!.calories, food!.proteinG, food!.carbsG, food!.fatG].every(value => Number.isFinite(value) && value >= 0))) return null;
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
    ...(recipe.cookingIngredients ? { cookingIngredients: recipe.cookingIngredients.map(item => ({
      ...item, ...(item.nutritionServings === undefined ? {} : { nutritionServings: item.nutritionServings * amount / recipe.servings }),
      cookingMeasurement: { ...item.cookingMeasurement, ...(item.cookingMeasurement.kind === "unmeasured" ? {} : { text: undefined, quantity: item.cookingMeasurement.quantity! * amount / recipe.servings, ...(item.cookingMeasurement.kind === "range" ? { upperQuantity: item.cookingMeasurement.upperQuantity! * amount / recipe.servings } : {}) }) },
    })) } : {}),
    source: provided ? "Source-provided recipe macros · approximate; not recalculated from ingredients."
      : "Ingredient-based nutrition · approximate.",
    sourceDetails: provided ? ["Original per-serving macros, not independently verified.", recipe.reference ?? "User-provided recipe nutrition"]
      : [...new Set(matched.map(food => `${food!.source} ${food!.sourceVersion}`))],
  };
}
