import { describe, expect, it } from "vitest";
import type { Meal, PlannedMeal } from "@/types/domain";
import { FOODS } from "@/constants/foods";
import { plannedMealNutrition } from "./plannedMealNutrition";

const food = FOODS[0];
const recipe: Meal = { id: "beef", name: "Beef bowl", servings: 4, ingredients: [{ foodId: food.id, servings: 1 }], providedNutrition: { calories: 560, proteinG: 45, carbsG: 58, fatG: 16 } };
const planned: PlannedMeal = { id: "planned", date: "2026-10-13", slot: "lunch", mealId: recipe.id, label: recipe.name, servings: 0.5 };

describe("planned portion nutrition", () => {
  it("scales supplied recipe macros by planned quantity rather than whole-recipe yield", () => {
    expect(plannedMealNutrition(planned, [recipe], [food])).toEqual({ calories: 280, proteinG: 22.5, carbsG: 29, fatG: 8 });
  });
  it("preserves stored plan values, including explicit zero, after a recipe changes", () => {
    expect(plannedMealNutrition({ ...planned, expectedCalories: 300, expectedProteinG: 0, expectedCarbsG: 35, expectedFatG: 10 }, [recipe], [food])).toEqual({ calories: 300, proteinG: 0, carbsG: 35, fatG: 10 });
  });
  it("scales food-only legacy rows by their planned portion", () => {
    const actual = plannedMealNutrition({ ...planned, mealId: undefined, foodId: food.id, servings: 2 }, [], [food]);
    expect(actual).toMatchObject({ calories: food.calories * 2, proteinG: food.proteinG * 2, carbsG: food.carbsG * 2, fatG: food.fatG * 2 });
  });
  it("does not present unresolved placeholder zero values as nutrition", () => {
    expect(plannedMealNutrition({ ...planned, mealId: "missing", expectedCalories: 0 }, [], [food])).toBeNull();
    expect(plannedMealNutrition(planned, [{ ...recipe, providedNutrition: undefined, ingredients: [{ foodId: "missing", servings: 1 }] }], [food])).toBeNull();
  });
  it("rejects invalid planned quantities", () => {
    for (const servings of [0, -1, NaN, Infinity]) expect(plannedMealNutrition({ ...planned, servings }, [recipe], [food])).toBeNull();
  });
});
