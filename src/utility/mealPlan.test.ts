import { describe, expect, it } from "vitest";
import { generateMealPlan } from "./mealPlan";
import { FOODS } from "@/constants/foods";
import { SAVED_MEALS } from "@/constants/meals";
import type { Meal } from "@/types/domain";

describe("meal plan generation", () => {
  it.each(["Low-carb", "Keto-style", "Vegetarian low-carb", "Vegan keto-style"])("checks the curated catalog for %s across supported energy estimates", (pattern) => {
    const cap = pattern.toLowerCase().includes("keto") ? 50 : 130;
    for (const dailyCalories of [1200, 1800, 2500, 4000]) {
      const plan = generateMealPlan("target-1", "2026-09-14", { dietaryPattern: pattern, allergies: [] }, { savedMeals: SAVED_MEALS, foods: FOODS, dailyCalories });
      for (const date of new Set(plan.meals.map((slot) => slot.date))) {
        const day = plan.meals.filter((slot) => slot.date === date);
        expect(day.reduce((sum, slot) => sum + (slot.expectedCarbsG ?? 0), 0)).toBeLessThanOrEqual(cap);
        expect(day.some((slot) => Boolean(slot.mealId || slot.foodId))).toBe(true);
      }
    }
  });
  it.each([["Low-carb", 130], ["Keto-style", 50]] as const)("enforces the %s daily limit and leaves infeasible slots unresolved", (pattern, cap) => {
    const trustedFoods = FOODS.map((food) => ({ ...food, valueSource: "trusted_catalog" as const }));
    const meal: Meal = { id: "test-trusted-meal", name: "Trusted serving", servings: 1, ingredients: [{ foodId: "food-rice", servings: 1 }] };
    const input = { dietaryPattern: pattern, allergies: [] };
    const catalog = { savedMeals: [meal], foods: trustedFoods };
    const plan = generateMealPlan("target-1", "2026-09-14", input, catalog);
    expect(generateMealPlan("target-1", "2026-09-14", input, catalog)).toEqual(plan);
    for (const date of new Set(plan.meals.map((slot) => slot.date))) {
      const day = plan.meals.filter((slot) => slot.date === date);
      expect(day.every((slot) => slot.expectedCarbsG !== undefined)).toBe(true);
      expect(day.reduce((sum, slot) => sum + (slot.expectedCarbsG ?? 0), 0)).toBeLessThanOrEqual(cap);
      if (pattern === "Keto-style") expect(day.some((slot) => !slot.mealId && !slot.foodId)).toBe(true);
    }
  });

  it("does not label starter estimates or missing ingredients as carb-compliant", () => {
    const plan = generateMealPlan("target-1", "2026-09-14", { dietaryPattern: "Keto-style", allergies: [] }, { foods: FOODS.filter((food) => food.valueSource === "development_catalog") });
    expect(plan.meals.every((slot) => !slot.mealId && !slot.foodId && slot.confidence === "low")).toBe(true);
    const missing: Meal = { id: "missing", name: "Unknown recipe", servings: 1, ingredients: [{ foodId: "not-found", servings: 1 }] };
    const unknown = generateMealPlan("target-1", "2026-09-14", { dietaryPattern: "Low-carb", allergies: [] }, { savedMeals: [missing], foods: [] });
    expect(unknown.meals.every((slot) => !slot.mealId && !slot.foodId)).toBe(true);
  });

  it("preserves allergy and vegetarian constraints with a carbohydrate preference", () => {
    const meal: Meal = { id: "test-egg", name: "Egg recipe", servings: 1, ingredients: [{ foodId: "food-egg", servings: 1 }] };
    const catalog = { savedMeals: [meal], foods: FOODS.map((food) => ({ ...food, valueSource: "trusted_catalog" as const })) };
    const plan = generateMealPlan("target-1", "2026-09-14", { dietaryPattern: "Vegetarian low-carb", allergies: ["egg", "nut", "apple", "banana"] }, catalog);
    expect(plan.meals.every((slot) => !slot.mealId && !slot.foodId)).toBe(true);
  });
  it("uses database-compatible preparation metadata for generated meals", () => {
    const plan = generateMealPlan("target-1", "2026-09-14", {
      dietaryPattern: "No restrictions",
      allergies: [],
    });

    expect(plan.meals).toHaveLength(28);
    expect(new Set(plan.meals.map((meal) => meal.preparationBasis))).toEqual(new Set(["as_labeled"]));
  });

  it("keeps slots unresolved instead of violating time or budget constraints", () => {
    const plan = generateMealPlan("target-1", "2026-09-14", {
      dietaryPattern: "No restrictions",
      allergies: [],
      cookingTimeMinutes: 5,
      mealBudget: 4,
    });

    expect(plan.meals.filter((meal) => meal.slot !== "snack").every((meal) => meal.mealId === undefined)).toBe(true);
    expect(plan.meals.filter((meal) => meal.slot !== "snack").every((meal) => meal.confidence === "low")).toBe(true);
  });

  it("can use an available owned recipe during deterministic generation", () => {
    const ownedMeal: Meal = {
      id: "meal-owned-overnight-oats",
      name: "Custom berry oats",
      servings: 1,
      ingredients: [{ foodId: "food-oats", servings: 1 }],
    };
    const plan = generateMealPlan(
      "target-1",
      "2026-09-14",
      {
        dietaryPattern: "No restrictions",
        allergies: [],
        foodPreferences: ["custom berry oats"],
        cookingTimeMinutes: 30,
        mealBudget: 20,
      },
      { savedMeals: [ownedMeal], foods: FOODS },
    );

    expect(plan.meals.filter((meal) => meal.mealId === ownedMeal.id)).not.toHaveLength(0);
    expect(plan.meals.find((meal) => meal.mealId === ownedMeal.id)?.expectedCalories).toBeGreaterThan(0);
  });
});
