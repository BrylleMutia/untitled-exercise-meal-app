import { describe, expect, it } from "vitest";
import { plannedDayNutrition } from "./plannedDayNutrition";
import type { PlannedMeal } from "@/types/domain";

const meal: PlannedMeal = { id: "beef", mealId: "archived-beef", label: "Beef", date: "2026-10-13", slot: "lunch", servings: 0.5, expectedCalories: 280, expectedProteinG: 22.5, expectedCarbsG: 29, expectedFatG: 8 };
describe("planned daily prescription totals", () => {
  it("retains stored fractional nutrition without needing current ingredients or logs", () => {
    expect(plannedDayNutrition([meal], meal.date).metrics.proteinG).toEqual({ value: 22.5, missingCount: 0 });
    expect(plannedDayNutrition([meal], meal.date).metrics.calories.value).toBe(280);
  });
  it("excludes skipped and other-date entries", () => {
    const result = plannedDayNutrition([meal, { ...meal, id: "skip", skipped: true }, { ...meal, date: "2026-10-14" }], meal.date);
    expect(result.mealCount).toBe(1); expect(result.skippedCount).toBe(1); expect(result.metrics.calories.value).toBe(280);
  });
  it("keeps metric-level known subtotals and valid zero", () => {
    const result = plannedDayNutrition([meal, { ...meal, id: "partial", expectedCalories: 0, expectedProteinG: undefined }], meal.date);
    expect(result.metrics.calories).toEqual({ value: 280, missingCount: 0 });
    expect(result.metrics.proteinG).toEqual({ value: 22.5, missingCount: 1 }); expect(result.affectedMeals).toBe(1);
  });
  it("does not mistake unresolved placeholder zero values for complete nutrition", () => {
    const result = plannedDayNutrition([{ ...meal, mealId: undefined, expectedCalories: 0 }], meal.date);
    expect(result.metrics.calories.value).toBeNull(); expect(result.affectedMeals).toBe(1);
  });
  it("rejects invalid values and portions without losing other metrics", () => {
    expect(plannedDayNutrition([{ ...meal, expectedFatG: Infinity }], meal.date).metrics.fatG.value).toBeNull();
    expect(plannedDayNutrition([{ ...meal, servings: 0 }], meal.date).affectedMeals).toBe(1);
    expect(plannedDayNutrition([], meal.date).metrics.calories.value).toBeNull();
  });
});
