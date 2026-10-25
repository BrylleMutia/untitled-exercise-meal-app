import { describe, expect, it } from "vitest";
import { dailyMealRows, slotCalorieLabel } from "./dailyMealRows";
import type { AppSnapshot, NutritionLog, PlannedMeal } from "@/types/domain";

const date = "2026-10-22";
const planned = (id: string, slot: PlannedMeal["slot"] = "lunch"): PlannedMeal => ({ id, date, slot, label: id, mealId: "recipe", servings: 1, expectedCalories: 200 });
const log = (id: string, extra: Partial<NutritionLog> = {}): NutritionLog => ({ id, date, slot: "lunch", customName: id, servings: 1, calories: 250, proteinG: 20, carbsG: 30, fatG: 5, estimated: false, confidence: "high", source: "test", valueSource: "user_provided", createdAt: `${date}T12:00:00Z`, ...extra });
function data(meals: PlannedMeal[] = [], logs: NutritionLog[] = []): AppSnapshot {
  return { mealPlan: { meals }, nutritionLogs: logs, loggedMeals: [], savedMeals: [{ id: "recipe", image: { kind: "asset", id: "korean-beef-bowl" } }], foods: [] } as unknown as AppSnapshot;
}
describe("daily meal preview", () => {
  it("keeps slot ordering, all active portions and missing-image fallbacks without changing input", () => {
    const value = data([planned("dinner", "dinner"), planned("lunch"), planned("breakfast", "breakfast"), { ...planned("skip"), skipped: true }, { ...planned("tomorrow"), date: "2026-10-23" }]);
    const original = structuredClone(value);
    expect(dailyMealRows(value, date).map(row => row.id)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(dailyMealRows(value, date)[0].image).toEqual({ kind: "asset", id: "korean-beef-bowl" });
    expect(value).toEqual(original);
  });
  it("replaces a linked plan with actual historical nutrition and counts grouped ingredients once", () => {
    const value = data([planned("linked"), planned("pending")], [log("a", { loggedMealId: "group", plannedMealId: "linked" }), log("b", { loggedMealId: "group", calories: 100 }), log("extra")]);
    value.loggedMeals = [{ id: "group", date, slot: "lunch", name: "Saved actual meal", plannedMealId: "linked", mealId: "recipe", sourceMode: "saved_meal", revision: 1, createdAt: `${date}T12:00:00Z` }];
    const rows = dailyMealRows(value, date);
    expect(rows).toHaveLength(3);
    expect(rows.find(row => row.id === "group")).toMatchObject({ calories: 350, name: "Saved actual meal", logged: true, log: { kind: "meal", id: "group", revision: 1 } });
    expect(rows.find(row => row.id === "pending")).toMatchObject({ calories: 200, logged: false });
    expect(slotCalorieLabel(rows)).toBe("≈800 kcal");
  });
  it("handles standalone linked food logs and independent logs without consuming other plans", () => {
    const rows = dailyMealRows(data([planned("linked"), planned("pending")], [log("actual", { plannedMealId: "linked" }), log("extra")]), date);
    expect(rows.map(row => row.id)).toEqual(["pending", "actual", "extra"]);
    expect(rows.find(row => row.id === "actual")?.log).toMatchObject({ kind: "nutrition", id: "actual" });
  });
  it("restores a linked plan after undoing its recorded meal without altering the plan", () => {
    const value = data([planned("linked")], [log("actual", { plannedMealId: "linked" })]);
    expect(dailyMealRows(value, date)[0].logged).toBe(true);
    value.nutritionLogs = [];
    expect(dailyMealRows(value, date)).toEqual([expect.objectContaining({ id: "linked", logged: false, calories: 200 })]);
  });
  it("retains zero and incomplete values without manufacturing calories", () => {
    const rows = dailyMealRows(data([{ ...planned("unknown"), expectedCalories: undefined }, { ...planned("zero"), expectedCalories: 0 }]), date);
    expect(rows[0].calories).toBeNull();
    expect(rows[1].calories).toBe(0);
    expect(slotCalorieLabel(rows)).toBe("Partial · ≈0 kcal");
    expect(slotCalorieLabel([rows[0]])).toBe("Calories unavailable");
    expect(slotCalorieLabel([])).toBeNull();
  });
  it("does not treat a grouped meal without saved ingredients as zero intake", () => {
    const value = data();
    value.loggedMeals = [{ id: "old", date, slot: "snack", name: "Legacy meal", mealId: "missing", sourceMode: "saved_meal", revision: 1, createdAt: date }];
    expect(dailyMealRows(value, date)[0]).toMatchObject({ calories: null, partial: true, logged: true, image: undefined });
  });
  it("uses saved planned calories without rescaling or reading current recipe nutrition", () => {
    const row = { ...planned("portion"), servings: 1.5, expectedCalories: 300 };
    expect(dailyMealRows(data([row]), date)[0]).toMatchObject({ calories: 300, partial: false });
  });
  it("retains known calorie subtotals without inventing missing intake", () => {
    const value = data([], [log("a", { loggedMealId: "group", calories: 0 }), log("b", { loggedMealId: "group", calories: NaN })]);
    value.loggedMeals = [{ id: "group", date, slot: "lunch", name: "Saved actual meal", mealId: "recipe", sourceMode: "saved_meal", revision: 1, createdAt: date }];
    const rows = dailyMealRows(value, date);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ calories: 0, partial: true });
    expect(slotCalorieLabel(rows)).toBe("Partial · ≈0 kcal");
  });
});
