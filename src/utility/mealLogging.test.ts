import { describe, expect, it, vi } from "vitest";
import type { AppActions } from "@/contexts/AppContext";
import { addFood, logMeal, plannedLogAvailable } from "./mealLogging";
import { FOODS } from "@/constants/foods";
import type { AppSnapshot, Meal, PlannedMeal } from "@/types/domain";

describe("shared planned logging", () => {
  it("disables logging for missing or invalid nutrition while retaining valid zero values", () => {
    const planned = { foodId: "food", servings: 1 } as PlannedMeal;
    const snapshot = { foods: [{ ...FOODS[0], id: "food", calories: 0 }], savedMeals: [] } as unknown as AppSnapshot;
    expect(plannedLogAvailable(planned, snapshot)).toBe(true);
    expect(plannedLogAvailable({ ...planned, skipped: true }, snapshot)).toBe(false);
    expect(plannedLogAvailable({ ...planned, foodId: "missing" }, snapshot)).toBe(false);
    snapshot.foods[0].calories = NaN;
    expect(plannedLogAvailable(planned, snapshot)).toBe(false);
  });
  it("requires a usable yield and numeric source-provided recipe nutrition", () => {
    const planned = { mealId: "recipe", servings: 1 } as PlannedMeal;
    const recipe: Meal = { id: "recipe", name: "Recipe", servings: 2, ingredients: [], providedNutrition: { calories: 200, proteinG: 10, carbsG: 20, fatG: 5 } };
    const snapshot = { foods: [], savedMeals: [recipe] } as unknown as AppSnapshot;
    expect(plannedLogAvailable(planned, snapshot)).toBe(true);
    recipe.servings = 0;
    expect(plannedLogAvailable(planned, snapshot)).toBe(false);
    recipe.servings = 2; recipe.providedNutrition!.calories = NaN;
    expect(plannedLogAvailable(planned, snapshot)).toBe(false);
  });
  it("passes a stable one-tap intent and the saved food portion to the authorized action", async () => {
    const logNutrition = vi.fn().mockResolvedValue(true);
    await addFood({ logNutrition } as unknown as AppActions, "lunch", "2026-10-22", FOODS[0], 1.5, "planned", "retry", true);
    expect(logNutrition).toHaveBeenCalledWith(expect.objectContaining({ plannedMealId: "planned", servings: 1.5, slot: "lunch" }), "retry", undefined, true);
  });
  it("uses provided nutrition for the exact planned portion even without measured ingredients", async () => {
    const saveReviewedMeal = vi.fn().mockResolvedValue(true);
    const recipe: Meal = { id: "provided", name: "Provided", servings: 4, ingredients: [], providedNutrition: { calories: 200, proteinG: 10, carbsG: 20, fatG: 5 } };
    expect(await logMeal({ saveReviewedMeal } as unknown as AppActions, [], "2026-10-22", "dinner", recipe, [], "planned", "retry", 1.5)).toBe(true);
    expect(saveReviewedMeal).toHaveBeenCalledWith(expect.objectContaining({ recipeServings: 1.5, plannedMealId: "planned", singlePlannedPortion: true, ingredients: [expect.objectContaining({ calories: 200, proteinG: 10, servings: 1.5 })] }), "retry");
  });
  it("blocks unresolved ingredient nutrition instead of inventing intake", async () => {
    const saveReviewedMeal = vi.fn();
    const recipe: Meal = { id: "missing", name: "Missing", servings: 2, ingredients: [{ foodId: "missing", servings: 1 }] };
    expect(await logMeal({ saveReviewedMeal } as unknown as AppActions, recipe.ingredients, "2026-10-22", "lunch", recipe, [], "planned", "retry", 1)).toBe(false);
    expect(saveReviewedMeal).not.toHaveBeenCalled();
  });
});
