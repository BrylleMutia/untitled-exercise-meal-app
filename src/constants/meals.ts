import type { Meal } from "@/types/domain";

/** Reusable saved meals; ingredient quantities are in food-catalog servings. */
export const SAVED_MEALS: Meal[] = [
  {
    id: "meal-yogurt-bowl",
    name: "Greek Yogurt Berry Bowl",
    servings: 1,
    notes: "Stir, top with berries and honey.",
    ingredients: [
      { foodId: "food-greek-yogurt", servings: 1 },
      { foodId: "food-blueberries", servings: 1 },
      { foodId: "food-oats", servings: 1 },
      { foodId: "food-honey", servings: 1 },
    ],
  },
  {
    id: "meal-pb-toast",
    name: "PB Banana Toast",
    servings: 1,
    notes: "Toast bread, spread, slice banana on top.",
    ingredients: [
      { foodId: "food-bread", servings: 2 },
      { foodId: "food-peanut-butter", servings: 2 },
      { foodId: "food-banana", servings: 1 },
    ],
  },
  {
    id: "meal-chicken-rice",
    name: "Chicken & Rice Plate",
    servings: 1,
    notes: "Pan-sear chicken, steam rice and broccoli, finish with olive oil.",
    ingredients: [
      { foodId: "food-chicken", servings: 1 },
      { foodId: "food-rice", servings: 1 },
      { foodId: "food-broccoli", servings: 2 },
      { foodId: "food-olive-oil", servings: 1 },
    ],
  },
  {
    id: "meal-salmon-potato",
    name: "Salmon & Sweet Potato",
    servings: 1,
    notes: "Bake both at 200°C; add greens.",
    ingredients: [
      { foodId: "food-salmon", servings: 1 },
      { foodId: "food-sweet-potato", servings: 1 },
      { foodId: "food-greens", servings: 1 },
    ],
  },
];

export function mealById(id: string): Meal | undefined {
  return SAVED_MEALS.find((m) => m.id === id);
}
