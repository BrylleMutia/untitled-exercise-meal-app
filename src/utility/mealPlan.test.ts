import { describe, expect, it } from "vitest";
import { generateMealPlan } from "./mealPlan";
import { FOODS } from "@/constants/foods";
import type { Meal } from "@/types/domain";

describe("meal plan generation", () => {
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
