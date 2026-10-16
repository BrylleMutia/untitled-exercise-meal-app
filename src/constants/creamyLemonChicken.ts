import type { Food, Meal, RecipeIngredient } from "@/types/domain";
import sources from "./creamyLemonChickenFoodSources.json";
import cooking from "./recipeCookingMeasurements.json";

const names: Record<number, [string, Food["category"], Food["preparationBasis"]]> = {
  172385: ["Chicken thigh fillet, skin-on", "Protein", "raw"],
  173410: ["Salted butter", "Dairy", "as_labeled"],
  171265: ["Whole milk (3.25% fat)", "Dairy", "as_labeled"],
  169761: ["All-purpose wheat flour", "Grains", "dry"],
  169640: ["Honey", "Pantry", "as_labeled"],
  167747: ["Fresh lemon juice", "Produce", "raw"],
};

/** Separate USDA identities never change the values of older catalog foods. */
export const CREAMY_LEMON_CHICKEN_FOODS: Food[] = sources.foods.map(record => ({
  id: `food-lemon-chicken-${record.fdcId}`, name: names[record.fdcId][0],
  category: names[record.fdcId][1], preparationBasis: names[record.fdcId][2],
  servingLabel: "100 g", servingGrams: 100, unit: "g", ...record.nutrientsPer100g,
  source: sources.source, sourceVersion: `SR Legacy:${record.fdcId}:reviewed-2026-10-12`,
  valueSource: "trusted_catalog", estimated: false, confidence: "high",
  fdcId: String(record.fdcId), recordType: "SR Legacy", nutrientsPer100g: record.nutrientsPer100g,
  ...(record.fdcId === 171265 ? { servingOptions: [{ label: "100 ml (approximately 103 g)", unit: "ml", grams: 103 }] } : {}),
}));

export const CREAMY_LEMON_CHICKEN: Meal = {
  id: "meal-creamy-lemon-chicken", name: "Creamy Lemon Chicken", isSystem: true,
  servings: 2, complexity: "easy", mealSlots: ["lunch", "dinner"], totalTimeMinutes: 30,
  image: { kind: "asset", id: "creamy-lemon-chicken" },
  reference: "https://www.tiktok.com/@madebythewa/video/7647909556240076033",
  ingredients: cooking["meal-creamy-lemon-chicken"].measurements as RecipeIngredient[],
  unmeasuredIngredients: cooking["meal-creamy-lemon-chicken"].unmeasuredIngredients,
  nutritionNotes: cooking["meal-creamy-lemon-chicken"].nutritionNotes,
  notes: cooking["meal-creamy-lemon-chicken"].instructions,
};
