import type { Food, Meal, RecipeIngredient } from "@/types/domain";
import sources from "./koreanBeefBowlFoodSources.json";
import cooking from "./recipeCookingMeasurements.json";

const names: Record<number, [string, Food["category"], Food["preparationBasis"]]> = {
  171790: ["Beef mince, 5% fat", "Protein", "raw"],
  168877: ["Jasmine rice (uncooked; long-grain rice proxy)", "Grains", "dry"],
  174277: ["Soy sauce (soy and wheat)", "Pantry", "as_labeled"],
  171016: ["Sesame oil", "Pantry", "as_labeled"],
  169230: ["Garlic", "Produce", "raw"],
  169231: ["Ginger (optional)", "Produce", "raw"],
  170393: ["Carrot", "Produce", "raw"],
  168409: ["Cucumber, with peel", "Produce", "raw"],
  170150: ["Sesame seeds", "Pantry", "as_labeled"],
  170005: ["Spring onion", "Produce", "raw"],
};
export const KOREAN_BEEF_BOWL_FOODS: Food[] = sources.foods.map(record => ({
  id: `food-korean-beef-${record.fdcId}`, name: names[record.fdcId][0],
  category: names[record.fdcId][1], preparationBasis: names[record.fdcId][2],
  servingLabel: "100 g", servingGrams: 100, unit: "g", ...record.nutrientsPer100g,
  source: sources.source, sourceVersion: `SR Legacy:${record.fdcId}:reviewed-2026-10-12`,
  valueSource: "trusted_catalog", estimated: false, confidence: "high",
  fdcId: String(record.fdcId), recordType: "SR Legacy", nutrientsPer100g: record.nutrientsPer100g,
}));
export const KOREAN_BEEF_BOWL: Meal = {
  id: "meal-korean-beef-bowl", name: "Korean Beef Bowl", isSystem: true,
  servings: 4, complexity: "easy", mealSlots: ["lunch", "dinner"],
  providedNutrition: { calories: 560, proteinG: 45, carbsG: 58, fatG: 16 },
  image: { kind: "asset", id: "korean-beef-bowl" },
  reference: "https://www.tiktok.com/@lazymealprep8/photo/7685839537762815254?image_index=3",
  ingredients: cooking["meal-korean-beef-bowl"].measurements as RecipeIngredient[],
  unmeasuredIngredients: cooking["meal-korean-beef-bowl"].unmeasuredIngredients,
  nutritionNotes: cooking["meal-korean-beef-bowl"].nutritionNotes,
  notes: cooking["meal-korean-beef-bowl"].instructions,
};
