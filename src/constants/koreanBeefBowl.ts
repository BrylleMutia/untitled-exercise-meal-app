import type { Food, Meal } from "@/types/domain";
import sources from "./koreanBeefBowlFoodSources.json";

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
  servings: 4, complexity: "easy",
  providedNutrition: { calories: 560, proteinG: 45, carbsG: 58, fatG: 16 },
  image: { kind: "asset", id: "korean-beef-bowl" },
  reference: "https://www.tiktok.com/@lazymealprep8/photo/7685839537762815254?image_index=3",
  ingredients: [
    { foodId: "food-korean-beef-171790", servings: 6 },
    { foodId: "food-korean-beef-168877", servings: 2.5 },
    { foodId: "food-korean-beef-174277", servings: 0.32 },
    { foodId: "food-lemon-chicken-169640", servings: 0.21 },
    { foodId: "food-korean-beef-171016", servings: 0.045 },
    { foodId: "food-korean-beef-169230", servings: 0.06 },
    { foodId: "food-korean-beef-169231", servings: 0.02 },
    { foodId: "food-korean-beef-170393", servings: 0.61 },
    { foodId: "food-korean-beef-168409", servings: 1.5 },
    { foodId: "food-korean-beef-170150", servings: 0.03 },
    { foodId: "food-korean-beef-170005", servings: 0.15 },
  ],
  notes: `Ingredients for 4 servings
600 g beef mince, 5% fat (raw weight)
250 g jasmine rice (uncooked weight)
2 tbsp soy sauce (approximately 32 g)
1 tbsp honey (approximately 21 g)
1 tsp sesame oil (approximately 4.5 g)
2 garlic cloves (approximately 6 g)
1 tsp ginger, optional (approximately 2 g; included in the estimate)
1 carrot, julienned (approximately 61 g)
½ cucumber, sliced (approximately 150 g)
Sesame seeds and spring onion (3 g and 15 g assumed for the whole recipe)

1. Cook the rice according to its package instructions.
2. Brown the mince and drain excess liquid. Cook ground beef through to 71°C (160°F).
3. Add garlic, soy sauce, honey, sesame oil, and ginger if using.
4. Simmer until glossy.
5. Divide the beef and cooked rice equally into 4 portions.
6. Add fresh carrot and cucumber on the side. Finish with sesame seeds and spring onion.

Source-reported macros per serving: approximately 560 kcal, 45 g protein, 58 g carbs, 16 g fat. These are reference estimates supplied with the recipe and have not been independently verified.

The app uses the source-provided macros above per serving, without recalculating them from the ingredients. Ingredient nutrition records are retained for ingredient information and groceries; they do not replace the supplied recipe macros. Garnish weights are assumptions for grocery quantities. Soy sauce contains soy and wheat; sesame oil and seeds contain sesame. Cooking time was not supplied. The generated cover is illustrative.`,
};
