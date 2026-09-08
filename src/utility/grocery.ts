import type {
  Food,
  GroceryCategory,
  GroceryItem,
  GroceryList,
  Meal,
  MealPlan,
} from "@/types/domain";

/**
 * Grocery generation combines duplicate ingredients across planned meals and
 * multiplies by planned servings. User edits are preserved by the merge policy:
 * checked state, custom items, removals, and quantity overrides survive
 * regeneration; changed generated quantities are surfaced, not overwritten.
 */
export function generateGroceryList(
  mealPlan: MealPlan,
  meals: Meal[],
  foods: Food[],
  weekOf: string,
): GroceryList {
  const totals = new Map<string, { food: Food; grams: number; pieces: number }>();

  for (const planned of mealPlan.meals) {
    if (planned.skipped) continue;
    if (planned.mealId) {
      const meal = meals.find((m) => m.id === planned.mealId);
      if (!meal) continue;
      for (const ing of meal.ingredients) {
        const food = foods.find((f) => f.id === ing.foodId);
        if (!food) continue;
        addTo(totals, food, ing.servings * planned.servings);
      }
    } else if (planned.foodId) {
      const food = foods.find((f) => f.id === planned.foodId);
      if (food) addTo(totals, food, planned.servings);
    }
  }

  const items: GroceryItem[] = [...totals.entries()]
    .sort((a, b) => a[1].food.category.localeCompare(b[1].food.category) || a[1].food.name.localeCompare(b[1].food.name))
    .map(([foodId, { food, grams, pieces }]) => ({
      id: `gi-${foodId}`,
      name: food.name,
      category: food.category as GroceryCategory,
      unit: food.unit === "piece" ? "pcs" : "g",
      generatedQuantity: food.unit === "piece" ? Math.ceil(pieces) : Math.round(grams),
      quantity: food.unit === "piece" ? Math.ceil(pieces) : Math.round(grams),
      checked: false,
    }));

  return { id: `gl-${weekOf}`, weekOf, items };
}

function addTo(
  totals: Map<string, { food: Food; grams: number; pieces: number }>,
  food: Food,
  servings: number,
) {
  const existing = totals.get(food.id) ?? { food, grams: 0, pieces: 0 };
  existing.grams += food.servingGrams * servings;
  existing.pieces += servings;
  totals.set(food.id, existing);
}

/** Merge policy for regeneration: never silently overwrite user corrections. */
export function mergeGroceryLists(previous: GroceryList, next: GroceryList): GroceryList {
  const prevById = new Map(previous.items.map((i) => [i.id, i]));

  const merged = next.items
    .filter((item) => !prevById.get(item.id)?.removed)
    .map((item) => {
      const prev = prevById.get(item.id);
      if (!prev) return item;
      const userAdjusted = prev.quantity !== prev.generatedQuantity;
      const generatedChanged = item.generatedQuantity !== prev.generatedQuantity;
      return {
        ...item,
        checked: prev.checked,
        // Keep the user's quantity unless they never touched it; surface the new
        // generated value separately so the UI can show "generated X" alongside.
        quantity: userAdjusted ? prev.quantity : item.generatedQuantity,
        generatedQuantity: generatedChanged ? item.generatedQuantity : prev.generatedQuantity,
      };
    });

  const customs = previous.items.filter((i) => i.custom && !i.removed);
  return { ...next, items: [...merged, ...customs] };
}
