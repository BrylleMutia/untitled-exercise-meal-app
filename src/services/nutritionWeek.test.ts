import { describe, expect, it } from "vitest";
import { mapNutritionWeek } from "./supabaseSnapshot";
import { nutritionWeekSnapshot } from "@/utility/nutritionWeek";
import type { AppSnapshot, Meal } from "@/types/domain";
import { addDays, dateKey, startOfWeek, weekDates } from "@/utility/dates";

const empty = { weekOf: "2026-10-05", mealPlan: null, plannedMeals: [], targets: [], nutritionLogs: [], loggedMeals: [], foods: [], recipes: [], ingredients: [], servingOptions: [], grocery: null, groceryItems: [] };
describe("weekly nutrition contracts", () => {
  it("keeps local dates and weekdays across midnight, month and year boundaries", () => {
    expect(dateKey(new Date(2026, 9, 13, 0, 0))).toBe("2026-10-13");
    expect(startOfWeek("2027-01-01")).toBe("2026-12-28");
    expect(weekDates("2026-12-28")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
    expect(addDays("2026-12-31", 7)).toBe("2027-01-07");
    expect(addDays("2027-01-07", -7)).toBe("2026-12-31");
  });
  it("distinguishes an empty week from malformed or wrong-week data", () => {
    expect(mapNutritionWeek(empty, empty.weekOf).mealPlan).toBeNull();
    expect(() => mapNutritionWeek(empty, "2026-10-12")).toThrow("different week");
    expect(() => mapNutritionWeek({ ...empty, nutritionLogs: undefined }, empty.weekOf)).toThrow("missing nutritionLogs");
  });
  it("retains complete history beyond one hundred records", () => {
    const log = { app_id: "entry", log_date: "2026-10-05", meal_slot: "breakfast", servings: 1, serving_quantity: 1, serving_unit: "serving", calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0, confidence: "high", estimated: false, source: "User", value_source: "user_provided", created_at: "2026-10-05T12:00:00Z" };
    expect(mapNutritionWeek({ ...empty, nutritionLogs: Array.from({ length: 110 }, (_, index) => ({ ...log, app_id: `entry-${index}` })) }, empty.weekOf).nutritionLogs).toHaveLength(110);
  });
  it("uses referenced archives without making hidden recipes selectable or changing global state", () => {
    const archived: Meal = { id: "hidden", name: "Hidden", servings: 1, ingredients: [] };
    const snapshot = { savedMeals: [], foods: [], nutritionLogs: [], mealPlan: { id: "today" } } as unknown as AppSnapshot;
    const week = { ...mapNutritionWeek(empty, empty.weekOf), recipes: [archived] };
    const scoped = nutritionWeekSnapshot(snapshot, week);
    expect(scoped.savedMeals[0].archivedAt).toBe("reference-only");
    expect(snapshot.savedMeals).toEqual([]); expect(snapshot.mealPlan?.id).toBe("today");
  });
});
