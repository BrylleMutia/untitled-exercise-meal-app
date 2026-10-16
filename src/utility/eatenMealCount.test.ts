import { describe, expect, it } from "vitest";
import type { LoggedMeal, NutritionLog } from "@/types/domain";
import { eatenMealCount } from "./eatenMealCount";

const date = "2026-10-14";
const meal: LoggedMeal = { id: "recipe-log", date, slot: "lunch", name: "Recipe", mealId: "recipe", sourceMode: "saved_meal", revision: 1, createdAt: `${date}T12:00:00Z` };
const log = (id: string, changes: Partial<NutritionLog> = {}): NutritionLog => ({ id, date, slot: "lunch", servings: 0.5,
  calories: 0, proteinG: 0, carbsG: 0, fatG: 0, estimated: false, confidence: "high", source: "User", valueSource: "user_provided", createdAt: `${date}T12:00:00Z`, ...changes });

describe("Eaten row counts", () => {
  it("counts no intake as zero and a fractional or zero-nutrition food as one row", () => {
    expect(eatenMealCount([], [], date)).toBe(0);
    expect(eatenMealCount([log("food")], [], date)).toBe(1);
  });
  it("counts a grouped recipe once, regardless of ingredients or portion size", () => {
    expect(eatenMealCount([log("a", { loggedMealId: meal.id }), log("b", { loggedMealId: meal.id, servings: 3 })], [meal], date)).toBe(1);
  });
  it("adds standalone rows in the same slot without imposing a four-meal cap", () => {
    expect(eatenMealCount([log("ingredient", { loggedMealId: meal.id }), ...Array.from({ length: 5 }, (_, i) => log(`food-${i}`))], [meal], date)).toBe(6);
  });
  it("keeps orphaned and differently slotted group references standalone, matching the renderer", () => {
    expect(eatenMealCount([log("orphan", { loggedMealId: "missing" }), log("different-slot", { loggedMealId: meal.id, slot: "breakfast" })], [meal], date)).toBe(3);
  });
  it("excludes other dates and responds to corrections and deletion without counting ingredients twice", () => {
    const logs = [log("a", { loggedMealId: meal.id }), log("b", { date: "2026-10-15" })];
    expect(eatenMealCount(logs, [meal, { ...meal, id: "other", date: "2026-10-15" }], date)).toBe(1);
    expect(eatenMealCount([{ ...logs[0], servings: 2 }], [meal], date)).toBe(1);
    expect(eatenMealCount([], [], date)).toBe(0);
  });
});
