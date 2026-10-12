import type { Food, Meal } from "@/types/domain";
import sources from "./creamyLemonChickenFoodSources.json";

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
  servings: 2, complexity: "easy", totalTimeMinutes: 30,
  image: { kind: "asset", id: "creamy-lemon-chicken" },
  reference: "https://www.tiktok.com/@madebythewa/video/7647909556240076033",
  ingredients: [
    { foodId: "food-lemon-chicken-172385", servings: 4 },
    { foodId: "food-lemon-chicken-173410", servings: 0.3 },
    { foodId: "food-lemon-chicken-169761", servings: 0.08 },
    { foodId: "food-lemon-chicken-171265", servings: 3.09 },
    { foodId: "food-lemon-chicken-167747", servings: 0.47 },
    { foodId: "food-lemon-chicken-169640", servings: 0.21 },
  ],
  notes: `Ingredients for 2 servings
400 g chicken thigh fillets, marinated with salt and pepper
25–30 g butter (30 g used for the estimate)
1 tbsp all-purpose flour (approximately 8 g)
300 ml milk (whole milk assumed; approximately 309 g)
Juice of 1 lemon (approximately 47 g)
1 tbsp honey (approximately 21 g)
Salt, pepper, chicken bouillon powder and MSG, to taste

1. Marinate the chicken with salt and pepper. Pan-fry skin-side down over medium heat without oil, letting the natural fat render until the skin is golden brown and crispy.
2. Flip and cook for another 5–10 minutes, or until fully cooked through. Check that the thickest part reaches 74°C (165°F); time varies with thickness. Remove the chicken and keep it aside.
3. In the same pan, melt the butter. Add the flour and cook briefly to form a roux. Slowly pour in the milk while stirring continuously to avoid lumps.
4. Stir in the lemon juice and honey. Season to taste with salt, pepper, chicken bouillon powder and MSG.
5. Return the chicken to the sauce and simmer for 1–2 minutes so everything comes together.

Nutrition estimate: 2 equal servings; 400 g raw boneless skin-on thigh meat, 30 g butter, whole milk, 8 g flour, 47 g lemon juice and 21 g honey. Counts all chicken fat and sauce as eaten. Milk type, butter quantity and discarded rendered fat change the result. Seasonings are unmeasured and excluded from the macro estimate; sodium is not estimated. Rice and other sides are not included. The generated image is illustrative.`,
};
