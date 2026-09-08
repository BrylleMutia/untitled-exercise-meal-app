import type { Food } from "@/types/domain";

export const FOOD_SOURCE = "Demo Food Catalog";
export const FOOD_SOURCE_VERSION = "2026.09";

/**
 * Demo nutrition catalog. Values are per serving as labeled and are estimates
 * for the mockup; production must select one trusted, versioned database per
 * FEATURES.md and retain source + version on every record.
 */
const f = (
  id: string,
  name: string,
  servingLabel: string,
  servingGrams: number,
  calories: number,
  proteinG: number,
  carbsG: number,
  fatG: number,
  category: Food["category"],
  unit: Food["unit"] = "g",
  confidence: Food["confidence"] = "high",
  fiberG?: number,
): Food => ({
  id,
  name,
  servingLabel,
  servingGrams,
  unit,
  calories,
  proteinG,
  carbsG,
  fatG,
  fiberG,
  category,
  source: FOOD_SOURCE,
  sourceVersion: FOOD_SOURCE_VERSION,
  estimated: true,
  confidence,
});

export const FOODS: Food[] = [
  f("food-egg", "Egg", "1 large egg", 50, 72, 6.3, 0.4, 4.8, "Protein", "piece"),
  f("food-chicken", "Chicken breast", "120 g, cooked", 120, 198, 37, 0, 4.3, "Protein"),
  f("food-salmon", "Salmon", "120 g fillet", 120, 250, 26, 0, 15, "Protein"),
  f("food-tofu", "Tofu", "150 g", 150, 114, 12, 2.9, 6, "Protein"),
  f("food-greek-yogurt", "Greek yogurt", "170 g cup", 170, 100, 17, 6, 0.7, "Dairy"),
  f("food-milk", "Milk", "250 ml glass", 250, 122, 8, 12, 4.8, "Dairy"),
  f("food-cheddar", "Cheddar", "30 g slice", 30, 121, 7, 0.4, 10, "Dairy"),
  f("food-oats", "Rolled oats", "40 g dry", 40, 152, 5.3, 26, 2.6, "Grains", "g", "high", 4),
  f("food-bread", "Whole wheat bread", "1 slice", 32, 81, 4, 13.8, 1.1, "Grains", "piece", "high", 1.9),
  f("food-rice", "White rice", "150 g, cooked", 150, 194, 4.1, 42, 0.4, "Grains"),
  f("food-pasta", "Pasta", "150 g, cooked", 150, 236, 8.5, 46, 1.4, "Grains", "g", "high", 2.7),
  f("food-banana", "Banana", "1 medium", 118, 105, 1.3, 27, 0.4, "Produce", "piece", "high", 3.1),
  f("food-apple", "Apple", "1 medium", 182, 95, 0.5, 25, 0.3, "Produce", "piece", "high", 4.4),
  f("food-blueberries", "Blueberries", "100 g", 100, 57, 0.7, 14.5, 0.3, "Produce", "g", "high", 2.4),
  f("food-broccoli", "Broccoli", "100 g, cooked", 100, 35, 2.4, 7.2, 0.4, "Produce", "g", "high", 3.3),
  f("food-sweet-potato", "Sweet potato", "150 g, baked", 150, 129, 2.3, 30, 0.2, "Produce", "g", "high", 4.5),
  f("food-greens", "Mixed greens", "80 g bowl", 80, 18, 1.4, 3, 0.2, "Produce", "g", "medium", 2),
  f("food-peanut-butter", "Peanut butter", "1 tbsp (16 g)", 16, 96, 3.6, 3.6, 8.2, "Pantry"),
  f("food-olive-oil", "Olive oil", "1 tsp (5 ml)", 5, 40, 0, 0, 4.5, "Pantry", "g", "medium"),
  f("food-butter", "Butter", "1 tsp (5 g)", 5, 36, 0, 0, 4.1, "Dairy", "g", "medium"),
  f("food-almonds", "Almonds", "28 g handful", 28, 164, 6, 6, 14, "Pantry", "g", "high", 3.5),
  f("food-honey", "Honey", "1 tsp (7 g)", 7, 21, 0, 5.7, 0, "Pantry"),
];

export function foodById(id: string): Food | undefined {
  return FOODS.find((food) => food.id === id);
}
