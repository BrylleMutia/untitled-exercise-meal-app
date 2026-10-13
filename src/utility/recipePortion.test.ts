import { describe, expect, it } from "vitest";
import { FOODS } from "@/constants/foods";
import type { Meal } from "@/types/domain";
import { foodMacros } from "./nutrition";
import { recipePortion, recipeReviewToken } from "./recipePortion";

const food = { ...FOODS[0], valueSource: "trusted_catalog" as const };
const recipe: Meal = { id: "beef", name: "Korean Beef Bowl", revision: 1, servings: 4, ingredients: [{ foodId: food.id, servings: 8 }], providedNutrition: { calories: 560, proteinG: 45, carbsG: 58, fatG: 16 } };
describe("reviewed recipe portions", () => {
  it("preserves provided macros and scales fractional servings without changing recipe yield", () => {
    expect(recipePortion(recipe, [food], "1")?.nutrition).toEqual(recipe.providedNutrition);
    expect(recipePortion(recipe, [food], "0.5")?.nutrition).toEqual({ calories: 280, proteinG: 22.5, carbsG: 29, fatG: 8 });
    expect(recipePortion(recipe, [food], "0.5")?.ingredients).toEqual([{ foodId: food.id, servings: 1 }]);
    expect(recipe.servings).toBe(4);
    expect(recipe.ingredients[0].servings).toBe(8);
  });
  it.each(["", " ", "0", "-1", "Infinity", "NaN", "not a number"])("rejects invalid servings %s", value => {
    expect(recipePortion(recipe, [food], value)).toBeNull();
  });
  it("calculates the ingredient portion using the same scaled quantities as logging", () => {
    const ingredientRecipe = { ...recipe, providedNutrition: undefined };
    expect(recipePortion(ingredientRecipe, [food], "0.25")?.nutrition).toEqual(foodMacros(food, 0.5));
  });
  it("rejects unavailable recipes, incomplete ingredients, and invalid nutrition instead of partial totals", () => {
    expect(recipePortion(undefined, [food], "1")).toBeNull();
    expect(recipePortion({ ...recipe, archivedAt: "2026-10-01" }, [food], "1")).toBeNull();
    expect(recipePortion(recipe, [], "1")).toBeNull();
    expect(recipePortion({ ...recipe, ingredients: [...recipe.ingredients, { foodId: "missing", servings: 1 }] }, [food], "1")).toBeNull();
    expect(recipePortion({ ...recipe, servings: 0 }, [food], "1")).toBeNull();
    expect(recipePortion({ ...recipe, providedNutrition: { ...recipe.providedNutrition!, calories: NaN } }, [food], "1")).toBeNull();
  });
  it("keeps logging available while applying planning source restrictions", () => {
    expect(recipePortion(recipe, [food], "1", true)?.canPlan).toBe(false);
    expect(recipePortion({ ...recipe, providedNutrition: undefined }, [food], "1", true)?.canPlan).toBe(true);
    expect(recipePortion(recipe, [{ ...food, valueSource: "ai_estimate" }], "1")?.canPlan).toBe(false);
  });
  it("detects changed recipes and ingredient values after restoring by identity", () => {
    const token = recipeReviewToken(recipe, [food]);
    expect(recipeReviewToken({ ...recipe }, [{ ...food }])).toBe(token);
    expect(recipeReviewToken({ ...recipe, revision: 2 }, [food])).not.toBe(token);
    expect(recipeReviewToken({ ...recipe, servings: 2 }, [food])).not.toBe(token);
    expect(recipeReviewToken(recipe, [{ ...food, calories: food.calories + 1 }])).not.toBe(token);
    expect(recipeReviewToken(recipe, [])).not.toBe(token);
  });
});
