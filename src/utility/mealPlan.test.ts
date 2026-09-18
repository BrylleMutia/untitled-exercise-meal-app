import { describe, expect, it } from "vitest";
import { generateMealPlan } from "./mealPlan";

describe("meal plan generation", () => {
  it("uses database-compatible preparation metadata for generated meals", () => {
    const plan = generateMealPlan("target-1", "2026-09-14", {
      dietaryPattern: "No restrictions",
      allergies: [],
    });

    expect(plan.meals).toHaveLength(28);
    expect(new Set(plan.meals.map((meal) => meal.preparationBasis))).toEqual(new Set(["as_labeled"]));
  });
});
