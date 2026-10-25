import { describe, expect, it } from "vitest";
import type { SaveReviewedMealInput } from "@/types/backend";
import { reviewedMealValidationError } from "./reviewedMealValidation";

const input = (count: number, sourceMode: SaveReviewedMealInput["sourceMode"] = "saved_meal"): SaveReviewedMealInput => ({
  date: "2026-10-25", slot: "dinner", name: "Saved recipe", sourceMode,
  meal: { id: "recipe", name: "Saved recipe", servings: 4, ingredients: [] },
  ingredients: Array.from({ length: count }, () => ({ date: "2026-10-25", slot: "dinner", source: "Catalog", valueSource: "trusted_catalog", estimated: false, confidence: "high", foodId: "food", servings: 0.25, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 })),
});

describe("reviewed meal validation", () => {
  it.each([1, 10, 11, 100])("accepts %i saved-recipe ingredients, including zero nutrition", count => {
    expect(reviewedMealValidationError(input(count))).toBeNull();
  });
  it("reports too many saved ingredients without claiming they are missing", () => {
    expect(reviewedMealValidationError(input(101))).toBe("This meal supports at most 100 reviewed ingredients.");
  });
  it("retains the ten-ingredient AI review limit", () => {
    expect(reviewedMealValidationError(input(10, "ai_assisted"))).toBeNull();
    expect(reviewedMealValidationError(input(11, "ai_assisted"))).toBe("This meal supports at most 10 reviewed ingredients.");
  });
  it("distinguishes empty ingredients from an unnamed meal", () => {
    expect(reviewedMealValidationError(input(0))).toBe("Add at least one reviewed ingredient before saving the meal.");
    expect(reviewedMealValidationError({ ...input(11), name: " " })).toBe("Enter a meal name before saving.");
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid portion %s", servings => {
    const meal = input(11); meal.ingredients[0].servings = servings;
    expect(reviewedMealValidationError(meal)).toBe("Review quantities and nutrition values before saving.");
  });
  it.each([-1, NaN, Infinity])("rejects invalid nutrition %s", calories => {
    const meal = input(11); meal.ingredients[0].calories = calories;
    expect(reviewedMealValidationError(meal)).toBe("Review quantities and nutrition values before saving.");
  });
});
