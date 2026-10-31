import { describe, expect, it } from "vitest";
import type { Meal, MealPlan } from "@/types/domain";
import { normalizedRecipeNutrition, parseCookingIngredients, parseRecipeNutritionInput } from "./recipeCooking";
import { generateGroceryList } from "./grocery";
import { recipePortion } from "./recipePortion";
import { recipePreview, recipeUnitConversion } from "./recipeEditor";
import { cookingUnitLabel } from "./cookingUnits";
import { usableRecipeNutrition } from "./planningPreferences";

const recipe: Meal = { id: "rice-onion", name: "Rice and onion", servings: 4, ingredients: [], providedNutrition: { calories: 300, proteinG: 6, carbsG: 60, fatG: 3 },
 cookingIngredients: [{ id: "rice", cookingMeasurement: { kind: "range", name: "Rice", quantity: 1, upperQuantity: 2, unit: "cup" } }, { id: "onion", cookingMeasurement: { kind: "amount", name: "Onion", quantity: 1, unit: "piece" } }] };
describe("independent recipe cooking and nutrition", () => {
 it("normalizes whole-recipe input without losing source precision", () => {
  const input = { method: "provided" as const, basis: "whole-recipe" as const, values: { calories: 1200, proteinG: 25, carbsG: 240, fatG: 12 } };
  expect(normalizedRecipeNutrition(input, 4)).toEqual({ calories: 300, proteinG: 6.25, carbsG: 60, fatG: 3 });
  expect(normalizedRecipeNutrition(input, 6)?.calories).toBe(200);
  expect(input.values.calories).toBe(1200);
  expect(normalizedRecipeNutrition({ ...input, basis: "per-serving" }, 6)?.calories).toBe(1200);
 });
 it("rejects missing, negative and nonfinite macro values", () => {
  expect(parseRecipeNutritionInput({ method: "provided", basis: "whole-recipe" })).toBeNull();
  expect(parseRecipeNutritionInput({ method: "provided", basis: "whole-recipe", values: { calories: NaN } })).toBeNull();
  expect(normalizedRecipeNutrition({ method: "provided", basis: "whole-recipe", values: { calories: -1, proteinG: 0, carbsG: 0, fatG: 0 } }, 4)).toBeNull();
 });
 it("accepts cooking-only rows and rejects duplicate identities or malformed measurements", () => {
  expect(parseCookingIngredients(recipe.cookingIngredients)).toEqual(recipe.cookingIngredients);
  expect(parseCookingIngredients([recipe.cookingIngredients![0], recipe.cookingIngredients![0]])).toBeNull();
  expect(parseCookingIngredients([{ id: "bad", cookingMeasurement: { kind: "amount", name: "Rice", quantity: 0, unit: "cup" } }])).toBeNull();
 });
 it("allows optional conversion drafts only in recipe-wide preview", () => {
  const row = { id: "rice", name: "Rice", food: null, included: true, assumptions: [], quantity: "2", unit: "cup", pendingConversion: { unit: "g", gramsPerUnit: "" } };
  expect(recipePreview([row], "4", [], true)).not.toBeNull();
  expect(recipePreview([row], "4", [])).toBeNull();
  expect(recipeUnitConversion(row, null, "tbsp")).toMatchObject({ status: "converted", patch: { quantity: "32" } });
  expect(recipeUnitConversion(row, null, "g").status).toBe("confirmation");
 });
 it("scales native groceries, uses the upper bound, and sums counts before rounding", () => {
  const plan = { meals: [{ mealId: recipe.id, servings: 1 }, { mealId: recipe.id, servings: 1 }] } as MealPlan;
  const items = generateGroceryList(plan, [recipe], [], "2026-10-25").items;
  expect(items.find(i => i.name === "Rice")).toMatchObject({ quantity: 1, unit: "cup" });
  expect(items.find(i => i.name === "Onion")).toMatchObject({ quantity: 1, unit: "piece" });
  expect(cookingUnitLabel("piece", 1)).toBe("pc");
  expect(cookingUnitLabel("piece", 2)).toBe("pcs");
  expect(cookingUnitLabel("cup", 2)).toBe("cups");
 });
 it("does not merge unlinked foods from different recipes by name", () => {
  const other = { ...recipe, id: "another" };
  const plan = { meals: [{ mealId: recipe.id, servings: 4 }, { mealId: other.id, servings: 4 }] } as MealPlan;
  expect(generateGroceryList(plan, [recipe, other], [], "2026-10-25").items).toHaveLength(4);
 });
 it("supports planning and portion review without ingredient nutrition", () => {
  expect(usableRecipeNutrition(recipe, [])).toBe(true);
  expect(recipePortion(recipe, [], "2")?.nutrition).toEqual({ calories: 600, proteinG: 12, carbsG: 120, fatG: 6 });
 });
});
