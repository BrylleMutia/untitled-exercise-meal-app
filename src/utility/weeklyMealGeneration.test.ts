import { describe, expect, it } from "vitest";
import type { AppSnapshot, Meal, PlannedMeal } from "@/types/domain";
import { FOODS } from "@/constants/foods";
import { SAVED_MEALS } from "@/constants/meals";
import { generateWeeklyMeals, weeklyRecipeOptions } from "./weeklyMealGeneration";
import { recipeMealSlots, validRecipeYield } from "./recipeMealSlots";
import { weekDates } from "./dates";

const week = "2026-12-28";
const recipe = (id: string, slots: Meal["mealSlots"], servings = 4): Meal => ({ id, name: id, servings, mealSlots: slots, revision: 1, ingredients: [{ foodId: FOODS[0].id, servings: 1 }] });
function snapshot(meals: Meal[], planned: PlannedMeal[] = []): AppSnapshot {
  return { userId: "owner", profile: { dietaryPattern: "No restrictions", allergies: [] }, foods: FOODS, savedMeals: meals,
    nutritionLogs: [], loggedMeals: [], nutritionWeekTargets: [{ id: "target", version: 1, effectiveDate: "2026-01-01", safetyOutcome: "supported" }],
    mealPlan: { id: "plan", weekOf: week, version: 1, targetId: "target", meals: planned }, grocery: null } as unknown as AppSnapshot;
}
const row = (date: string, slot: PlannedMeal["slot"], mealId = "existing", servings = 1): PlannedMeal => ({ id: `${date}-${slot}`, date, slot, mealId, label: mealId, servings });

describe("weekly recipe generation", () => {
  it("fills each selected recipe's yield with whole portions, repeats deterministically and shuffles", () => {
    const data = snapshot([recipe("a", ["lunch", "dinner"])]);
    const preview = generateWeeklyMeals(data, week, ["a"], "seed");
    expect(preview.assignments).toHaveLength(4);
    expect(preview.unused).toEqual([]);
    expect(preview.assignments.every(entry => entry.servings === 1 && weekDates(week).includes(entry.date))).toBe(true);
    expect(generateWeeklyMeals(data, week, ["a"], "seed")).toEqual(preview);
    expect(generateWeeklyMeals(data, week, ["a"], "different").assignments).not.toEqual(preview.assignments);
  });
  it("counts active planned portions across slots, including linked logs, but leaves skipped/eaten slots occupied", () => {
    const data = snapshot([recipe("a", recipeMealSlots)], [row(week, "lunch", "a"), { ...row(week, "dinner", "a"), skipped: true }]);
    data.loggedMeals = [{ id: "logged", plannedMealId: `${week}-lunch`, date: week, slot: "lunch" }, { id: "independent", date: week, slot: "snack" }] as AppSnapshot["loggedMeals"];
    data.nutritionLogs = [{ date: week, slot: "breakfast" }] as AppSnapshot["nutritionLogs"];
    const preview = generateWeeklyMeals(data, week, ["a"], "x");
    expect(preview.assignments).toHaveLength(3);
    expect(preview.assignments.every(entry => entry.date !== week)).toBe(true);
    expect(weeklyRecipeOptions(data, week)[0].used).toBe(1);
  });
  it("does not strand constrained recipes behind flexible recipes", () => {
    const data = snapshot([recipe("flexible", ["breakfast", "lunch"], 1), recipe("breakfast-only", ["breakfast"], 1)],
      weekDates(week).flatMap(date => recipeMealSlots.filter(slot => date !== week || slot === "dinner" || slot === "snack").map(slot => row(date, slot))));
    for (let seed = 0; seed < 30; seed++) {
      const preview = generateWeeklyMeals(data, week, data.savedMeals.map(meal => meal.id), String(seed));
      expect(preview.assignments).toHaveLength(2);
      expect(preview.assignments.find(entry => entry.mealId === "breakfast-only")?.slot).toBe("breakfast");
    }
  });
  it("reports shortages, fractions and over-capacity without editing existing entries", () => {
    const data = snapshot([recipe("a", ["lunch"], 4)], [row(week, "dinner", "a", 0.5)]);
    const before = structuredClone(data);
    const preview = generateWeeklyMeals(data, week, ["a"], "x");
    expect(preview.assignments).toHaveLength(3);
    expect(preview.unused[0].servings).toBe(0.5);
    expect(data).toEqual(before);
    data.mealPlan!.meals[0].servings = 5;
    expect(generateWeeklyMeals(data, week, ["a"], "x").assignments).toHaveLength(0);
    expect(weeklyRecipeOptions(data, week)[0].reason).toContain("No whole servings");
    expect(weeklyRecipeOptions(data, week)[0].reasonCode).toBe("exhausted");
    expect(generateWeeklyMeals(data, week, ["a"], "select-exhausted").assignments).toEqual([]);
  });
  it("excludes unassigned, archived, invalid, allergic, and over-time recipes", () => {
    const data = snapshot([recipe("none", []), { ...recipe("archived", ["lunch"]), archivedAt: "now" }, recipe("fraction", ["lunch"], 2.5), { ...recipe("slow", ["lunch"]), totalTimeMinutes: 60 }]);
    data.profile!.cookingTimeMinutes = 15;
    expect(weeklyRecipeOptions(data, week).every(option => option.reason)).toBe(true);
    expect(generateWeeklyMeals(data, week, data.savedMeals.map(meal => meal.id), "x").assignments).toEqual([]);
  });
  it("uses only dates with an eligible target and preserves supplied macros", () => {
    const beef = SAVED_MEALS.find(meal => meal.id === "meal-korean-beef-bowl")!;
    const data = snapshot([beef]);
    data.nutritionWeekTargets[0].effectiveDate = "2027-01-01";
    const preview = generateWeeklyMeals(data, week, [beef.id], "x");
    expect(preview.assignments).toHaveLength(4);
    expect(preview.assignments.every(entry => entry.date >= "2027-01-01" && entry.expectedCalories === 560 && entry.expectedProteinG === 45 && entry.expectedCarbsG === 58 && entry.expectedFatG === 16)).toBe(true);
  });
  it("maximizes assignments under a daily carbohydrate cap", () => {
    const data = snapshot([recipe("high", ["lunch", "dinner"], 7), recipe("low", ["lunch", "dinner"], 7)]);
    data.profile!.dietaryPattern = "Keto-style";
    data.foods = [{ ...FOODS[0], id: "high-food", valueSource: "trusted_catalog", carbsG: 40 }, { ...FOODS[0], id: "low-food", valueSource: "trusted_catalog", carbsG: 10 }];
    data.savedMeals.forEach((meal, i) => { meal.ingredients = [{ foodId: data.foods[i].id, servings: 7 }]; });
    const preview = generateWeeklyMeals(data, week, ["high", "low"], "x");
    expect(preview.assignments).toHaveLength(14);
    for (const date of weekDates(week)) expect(preview.assignments.filter(row => row.date === date).reduce((sum, row) => sum + row.expectedCarbsG!, 0)).toBeLessThanOrEqual(50);
  });
  it("accepts only whole recipe yields", () => {
    for (const value of [0, 0.5, 2.5, 10001, NaN, Infinity]) expect(validRecipeYield(value)).toBe(false);
    for (const value of [1, 4, 10000]) expect(validRecipeYield(value)).toBe(true);
  });
  it("bounds symmetric carb-constrained arrangements without enumerating equivalent permutations", () => {
    const data = snapshot(Array.from({ length: 7 }, (_, i) => recipe(`recipe-${i}`, recipeMealSlots, 4)));
    data.profile!.dietaryPattern = "Keto-style";
    data.foods = [{ ...FOODS[0], valueSource: "trusted_catalog", carbsG: 26 }];
    data.savedMeals.forEach(meal => { meal.ingredients = [{ foodId: data.foods[0].id, servings: 4 }]; });
    const preview = generateWeeklyMeals(data, week, data.savedMeals.map(meal => meal.id), "symmetric");
    expect(preview.assignments).toHaveLength(7);
    expect(new Set(preview.assignments.map(row => row.date)).size).toBe(7);
    expect(preview.unused.reduce((sum, row) => sum + row.servings, 0)).toBe(21);
  });
});
