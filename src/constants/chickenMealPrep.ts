import type { Food, Meal } from "@/types/domain";
import sources from "./chickenMealPrepFoodSources.json";
import recipes from "./chickenMealPrepRecipes.json";

export const CHICKEN_MEAL_PREP_FOODS: Food[] = sources.foods.map(record => ({
  id: `food-chicken-prep-${record.fdcId}`, name: record.name,
  category: record.category as Food["category"], preparationBasis: record.preparationBasis as Food["preparationBasis"],
  servingLabel: "100 g", servingGrams: 100, unit: "g", ...record.nutrientsPer100g,
  source: sources.source, sourceVersion: `${record.recordType}:${record.fdcId}:reviewed-${sources.reviewedOn}`,
  valueSource: "trusted_catalog", estimated: false, confidence: "high",
  fdcId: String(record.fdcId), recordType: record.recordType, nutrientsPer100g: record.nutrientsPer100g,
  servingOptions: record.sourceMeasures.filter(measure => ["tsp", "tbsp", "cup", "piece"].includes(measure.unit))
    .map(measure => ({ label: `${measure.amount} ${measure.unit}`, unit: measure.unit, grams: measure.grams })),
}));

export const CHICKEN_MEAL_PREP_RECIPES: Meal[] = recipes.map(recipe => ({ ...recipe, isSystem: true } as Meal));
export const STICKY_TERIYAKI_CHICKEN = CHICKEN_MEAL_PREP_RECIPES[0];
export const CHICKEN_BURRITO_PROTEIN_BOXES = CHICKEN_MEAL_PREP_RECIPES[1];
