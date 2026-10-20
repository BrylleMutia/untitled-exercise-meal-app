import { describe, expect, it } from "vitest";
import { FOODS } from "@/constants/foods";
import { generateGroceryList, mergeGroceryLists } from "./grocery";
describe("week-specific grocery reconciliation", () => {
  it("buys shared projections once and restores personal fulfilment after leaving", () => {
    const food = { ...FOODS[0], id: "shared-food", unit: "g" as const, servingGrams: 100 };
    const recipe = { id: "shared-bowl", name: "Bowl", servings: 4, ingredients: [{ foodId: food.id, servings: 6 }] };
    const meal = { id: "gp-portion", label: "Bowl", date: "2026-10-05", slot: "lunch" as const, servings: 1, mealId: recipe.id, sharedGrocery: true };
    const plan = { id: "week", weekOf: meal.date, version: 1, targetId: "t", meals: [meal] };
    expect(generateGroceryList(plan, [recipe], [food], plan.weekOf).items).toEqual([]);
    expect(generateGroceryList({ ...plan, meals: [{ ...meal, sharedGrocery: false }] }, [recipe], [food], plan.weekOf).items[0].quantity).toBe(150);
  });
  it("scales whole-recipe ingredient quantities by recipe yield", () => {
    const food = { ...FOODS[0], id: "beef", unit: "g" as const, servingGrams: 100 };
    const recipe = { id: "bowl", name: "Bowl", servings: 4, ingredients: [{ foodId: "beef", servings: 6 }] };
    const plan = { id: "week", weekOf: "2026-10-05", version: 1, targetId: "t", meals: [{ id: "portion", label: "Bowl", date: "2026-10-05", slot: "lunch" as const, servings: 0.5, mealId: "bowl" }] };
    expect(generateGroceryList(plan, [recipe], [food], plan.weekOf).items[0].generatedQuantity).toBe(75);
  });
  it("retains the existing week's identity, revision, checked state and quantity override", () => {
    const item = { id: "ingredient", name: "Ingredient", category: "Other" as const, unit: "g", generatedQuantity: 100, quantity: 150, checked: true };
    const previous = { id: "existing-week", weekOf: "2026-10-05", revision: 7, totalAmountCentavos: 125050, totalAmountCarriedFromWeek: "2026-10-04", items: [item] };
    const next = { id: "generated-week", weekOf: previous.weekOf, items: [{ ...item, generatedQuantity: 200, quantity: 200, checked: false }] };
    expect(mergeGroceryLists(previous, next)).toMatchObject({ id: "existing-week", revision: 7, totalAmountCentavos: 125050, totalAmountCarriedFromWeek: "2026-10-04", items: [{ quantity: 150, generatedQuantity: 200, checked: true }] });
  });
});
