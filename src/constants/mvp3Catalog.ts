import sources from "./mvp3FoodSources.json";
import type { Food, Meal } from "@/types/domain";

const names: Record<string, [string, Food["category"]]> = {
  "173424": ["Hard-boiled egg", "Protein"],
  "171477": ["Roasted chicken breast, meat only", "Protein"],
  "169967": ["Broccoli, boiled without salt", "Produce"],
  "174290": ["Extra-firm tofu, prepared with nigari", "Protein"],
  "171413": ["Olive oil", "Pantry"],
  "170567": ["Almonds", "Pantry"],
};

/** New IDs preserve the source and serving assumptions of historical starter logs. */
export const MVP3_TRUSTED_FOODS: Food[] = sources.foods.map((record) => ({
  id: `food-mvp3-${record.fdcId}`, name: names[record.fdcId][0],
  servingLabel: `100 g · ${record.description}`, servingGrams: 100, unit: "g",
  ...record.nutrientsPer100g, category: names[record.fdcId][1],
  source: sources.source, sourceVersion: `${record.recordType}:${record.fdcId}:2019-04-01`,
  valueSource: "trusted_catalog", estimated: false, confidence: "high",
  fdcId: record.fdcId, recordType: record.recordType, nutrientsPer100g: record.nutrientsPer100g,
}));

const egg = "food-mvp3-173424", chicken = "food-mvp3-171477", broccoli = "food-mvp3-169967";
const tofu = "food-mvp3-174290", oil = "food-mvp3-171413", almonds = "food-mvp3-170567";
export const MVP3_MEALS: Meal[] = [
  { id: "meal-mvp3-eggs", name: "Egg, Broccoli & Almond Plate", servings: 1, isSystem: true,
    notes: "100 g hard-boiled egg, 50 g boiled broccoli, 28 g almonds, and 20 g olive oil. Weigh cooked portions; oil is included, not an uncounted topping.",
    ingredients: [{ foodId: egg, servings: 1 }, { foodId: broccoli, servings: 0.5 }, { foodId: almonds, servings: 0.28 }, { foodId: oil, servings: 0.2 }] },
  { id: "meal-mvp3-chicken", name: "Chicken & Broccoli Plate", servings: 1, isSystem: true,
    notes: "150 g roasted skinless chicken, 100 g boiled broccoli, and 25 g olive oil. Weigh cooked portions and count the oil used.",
    ingredients: [{ foodId: chicken, servings: 1.5 }, { foodId: broccoli, servings: 1 }, { foodId: oil, servings: 0.25 }] },
  { id: "meal-mvp3-tofu", name: "Tofu & Broccoli Plate", servings: 1, isSystem: true,
    notes: "300 g extra-firm nigari tofu, 50 g boiled broccoli, and 30 g olive oil. Values use this tofu type; brands can differ. Count oil separately if you change the recipe.",
    ingredients: [{ foodId: tofu, servings: 3 }, { foodId: broccoli, servings: 0.5 }, { foodId: oil, servings: 0.3 }] },
  { id: "meal-mvp3-tofu-almonds", name: "Tofu, Broccoli & Almond Bowl", servings: 1, isSystem: true,
    notes: "200 g extra-firm nigari tofu, 50 g boiled broccoli, 28 g almonds, and 20 g olive oil. Values assume measured portions and all listed oil.",
    ingredients: [{ foodId: tofu, servings: 2 }, { foodId: broccoli, servings: 0.5 }, { foodId: almonds, servings: 0.28 }, { foodId: oil, servings: 0.2 }] },
];

export const MVP3_MEAL_COST: Record<string, number> = { "meal-mvp3-eggs": 4, "meal-mvp3-chicken": 7, "meal-mvp3-tofu": 4, "meal-mvp3-tofu-almonds": 6 };
export const MVP3_MEAL_PREP: Record<string, number> = { "meal-mvp3-eggs": 15, "meal-mvp3-chicken": 30, "meal-mvp3-tofu": 15, "meal-mvp3-tofu-almonds": 15 };
