import { describe, expect, it } from "vitest";
import type { Food, LoggedMeal, Meal, NutritionLog } from "@/types/domain";
import { loggedRecipePortion, loggedRecipeServings, positiveRecipeServings } from "./loggedRecipeServings";

const group = { id: "log", mealId: "recipe", sourceMode: "saved_meal" } as LoggedMeal;
const recipe = { id: "recipe", servings: 2, ingredients: [{ foodId: "chicken", servings: 4 }, { foodId: "butter", servings: 0.3 }] } as Meal;
const entries = [
  { foodId: "chicken", servings: 6, calories: 1800, proteinG: 108, carbsG: 0, fatG: 144 },
  { foodId: "butter", servings: 0.45, calories: 286.5, proteinG: 7.8, carbsG: 63.9, fatG: 7.5 },
] as NutritionLog[];

describe("logged recipe portion corrections", () => {
  it("uses a saved portion independently of later recipe changes or archival", () => {
    expect(loggedRecipeServings({ ...group, recipeServings: 3 }, entries, { ...recipe, servings: 99, archivedAt: "2026-10-14" })).toBe(3);
    expect(loggedRecipeServings({ ...group, recipeServings: 0.5 }, entries)).toBe(0.5);
  });
  it("recovers three legacy recipe servings across every ingredient, including duplicate food rows", () => {
    expect(loggedRecipeServings(group, entries, recipe)).toBe(3);
    expect(loggedRecipeServings(group, entries, { ...recipe, ingredients: [...recipe.ingredients.slice(1), { foodId: "chicken", servings: 2 }, { foodId: "chicken", servings: 2 }] })).toBe(3);
  });
  it("does not infer from missing, extra, non-proportional or invalid ingredient snapshots", () => {
    for (const invalid of [entries.slice(0, 1), [...entries, { ...entries[0], foodId: "other" }], [entries[0], { ...entries[1], servings: 0.44 }], [entries[0], { ...entries[1], servings: NaN }]]) {
      expect(loggedRecipeServings(group, invalid, recipe)).toBeNull();
    }
    expect(loggedRecipeServings(group, entries)).toBeNull();
    expect(loggedRecipeServings({ ...group, sourceMode: "ai_assisted" }, entries, recipe)).toBeNull();
  });
  it("recovers source-provided servings without requiring an active recipe", () => {
    const provided = [{ ...entries[0], foodId: "macro", servings: 3, sourceVersion: "recipe:recipe:revision:2" }];
    expect(loggedRecipeServings(group, provided, undefined, [{ id: "macro", servingLabel: "1 recipe serving" } as Food])).toBe(3);
    expect(loggedRecipeServings(group, provided, undefined, [{ id: "macro", servingLabel: "100 g" } as Food])).toBeNull();
  });
  it("scales saved nutrition directly and preserves supplied macro fractions and zero values", () => {
    const portion = loggedRecipePortion(entries, 3, 1)!;
    expect(portion.calories).toBe(695.5);
    expect(portion.proteinG).toBeCloseTo(38.6, 10);
    expect(portion.carbsG).toBeCloseTo(21.3, 10);
    expect(portion.fatG).toBe(50.5);
    expect(loggedRecipePortion([{ ...entries[0], calories: 1680, proteinG: 135, carbsG: 174, fatG: 48 }], 3, 0.5)).toEqual({ calories: 280, proteinG: 22.5, carbsG: 29, fatG: 8 });
    expect(loggedRecipePortion([{ ...entries[0], calories: 0 }], 3, 0.5)?.calories).toBe(0);
    expect(loggedRecipePortion([{ ...entries[0], proteinG: NaN }], 3, 1)).toBeNull();
    expect(loggedRecipePortion([], 3, 1)).toBeNull();
  });
  it("accepts positive fractions and rejects blank, zero, negative, non-finite and oversized portions", () => {
    expect(positiveRecipeServings("0.5")).toBe(0.5);
    for (const invalid of ["", " ", "0", "-1", "NaN", "Infinity", "10001"]) expect(positiveRecipeServings(invalid)).toBeNull();
  });
});
