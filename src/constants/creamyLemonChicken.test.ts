import { describe, expect, it } from "vitest";
import { CREAMY_LEMON_CHICKEN, CREAMY_LEMON_CHICKEN_FOODS } from "./creamyLemonChicken";
import { SAVED_MEALS, RETIRED_SAVED_MEALS, mealById } from "./meals";
import { FOODS } from "./foods";
import { mealNutrition } from "@/utility/nutrition";
import { generateMealPlan } from "@/utility/mealPlan";
import { parseRecipeImage } from "@/utility/recipeImage";

describe("predefined recipe replacement", () => {
  it("keeps Creamy Lemon Chicken active while keeping retired identities readable", () => {
    expect(SAVED_MEALS).toContain(CREAMY_LEMON_CHICKEN);
    expect(CREAMY_LEMON_CHICKEN).toMatchObject({ servings: 2, complexity: "easy", totalTimeMinutes: 30, isSystem: true });
    expect(CREAMY_LEMON_CHICKEN.notes).toContain("Salt, pepper, chicken bouillon powder and MSG, to taste");
    expect(CREAMY_LEMON_CHICKEN.reference).toContain("7647909556240076033");
    expect(parseRecipeImage(CREAMY_LEMON_CHICKEN.image)).toEqual(CREAMY_LEMON_CHICKEN.image);
    expect(RETIRED_SAVED_MEALS).toHaveLength(8);
    expect(mealById("meal-yogurt-bowl")?.archivedAt).toBeDefined();
  });
  it("calculates required recipe macros from six verified foods and measured whole-recipe quantities", () => {
    expect(CREAMY_LEMON_CHICKEN_FOODS).toHaveLength(6);
    expect(new Set(FOODS.map(food => food.id)).size).toBe(FOODS.length);
    expect(CREAMY_LEMON_CHICKEN_FOODS.every(food => food.valueSource === "trusted_catalog" && food.fdcId)).toBe(true);
    const nutrition = mealNutrition(CREAMY_LEMON_CHICKEN, FOODS);
    expect(nutrition.perServing).toEqual({ calories: 695, proteinG: 39, carbsG: 21, fatG: 50 });
    expect(nutrition.calories).toBeCloseTo(1390.8, 1);
    expect(CREAMY_LEMON_CHICKEN.notes).toContain("Counts all chicken fat and sauce as eaten");
  });
  it("excludes retired recipes and honors dairy, wheat, vegetarian and cooking-time constraints", () => {
    const catalog = { savedMeals: [...SAVED_MEALS, ...RETIRED_SAVED_MEALS], foods: FOODS };
    const plan = generateMealPlan("t", "2026-10-12", { dietaryPattern: "No restrictions", allergies: [] }, catalog);
    expect(plan.meals.filter(meal => meal.mealId).every(meal => SAVED_MEALS.some(saved => saved.id === meal.mealId))).toBe(true);
    expect(plan.meals.filter(meal => meal.slot === "breakfast").every(meal => !meal.mealId)).toBe(true);
    for (const constraints of [{ dietaryPattern: "Vegetarian", allergies: [] }, { dietaryPattern: "Vegan", allergies: [] },
      { dietaryPattern: "No restrictions", allergies: ["milk"] }, { dietaryPattern: "No restrictions", allergies: ["wheat"] },
      { dietaryPattern: "No restrictions", allergies: [], cookingTimeMinutes: 29 }]) {
      expect(generateMealPlan("t", "2026-10-12", constraints, catalog).meals.some(meal => meal.mealId === CREAMY_LEMON_CHICKEN.id)).toBe(false);
    }
  });
});
