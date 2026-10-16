import { describe, expect, it } from "vitest";
import { FOODS } from "@/constants/foods";
import { recipeMethodPrefill, recipePreview, recipeServingPlan, recipeServingsControl, safeRecipeReference, type RecipeIngredientDraft, type RecipeIngredientMethod } from "./recipeEditor";

const food = FOODS[0];
const ingredient = (quantity: string, unit = "serving"): RecipeIngredientDraft => ({ id: "item", name: food.name, food, quantity, unit, included: true, assumptions: [] });
describe("recipe servings controls", () => {
  it("starts blank at one and prevents decrementing below one", () => {
    for (const value of ["", " "]) expect(recipeServingsControl(value)).toMatchObject({ minusDisabled: true, plusDisabled: false, increment: "1" });
    expect(recipeServingsControl("1")).toMatchObject({ minusDisabled: true, increment: "2", decrement: "1" });
  });
  it("requires whole yields without enabling a fractional preview", () => {
    for (const value of ["0", "0.5", "1.5", "9999.5"]) {
      expect(recipeServingsControl(value)).toMatchObject({ minusDisabled: true, plusDisabled: true });
      expect(recipePreview([ingredient("1")], value, FOODS)).toBeNull();
    }
    expect(recipeServingsControl("10000")).toMatchObject({ minusDisabled: false, plusDisabled: true });
    expect(recipePreview([ingredient("1")], "0", FOODS)).toBeNull();
  });
  it.each(["-1", "NaN", "Infinity", "10001", "e"])("disables invalid value %s", value => {
    expect(recipeServingsControl(value)).toMatchObject({ minusDisabled: true, plusDisabled: true });
  });
});
describe("recipe method prefill", () => {
  const methods: RecipeIngredientMethod[] = ["search", "describe", "custom"];
  const key = { search: "query", describe: "description", custom: "customName" } as const;
  it("carries the original text in every direction only into blank fields", () => {
    for (const from of methods) for (const to of methods) {
      if (from === to) continue;
      const fields = { query: "", description: "", customName: "", [key[from]]: "  Eggs! " };
      expect(recipeMethodPrefill(fields, from, to)).toEqual({ field: key[to], value: "  Eggs! " });
      expect(recipeMethodPrefill({ ...fields, [key[to]]: "Keep my input" }, from, to)).toBeNull();
    }
  });
  it("respects limits, empty source text, and same-method clicks", () => {
    const fields = { query: "x".repeat(4000), description: "", customName: "" };
    expect(recipeMethodPrefill(fields, "search", "custom")?.value).toHaveLength(256);
    expect(recipeMethodPrefill({ ...fields, query: "", description: "x".repeat(4000) }, "describe", "search")?.value).toHaveLength(180);
    expect(recipeMethodPrefill(fields, "search", "search")).toBeNull();
    expect(recipeMethodPrefill({ ...fields, query: " " }, "search", "describe")).toBeNull();
  });
});
describe("recipe preview", () => {
  it("updates fractions and serving count using the selected serving basis", () => {
    const preview = recipePreview([ingredient("1.5")], "2", FOODS)!;
    expect(preview.ingredients).toMatchObject([{ foodId: food.id, servings: 1.5, cookingMeasurement: { quantity: 1.5, unit: "serving" } }]);
    expect(preview.perServing.calories).toBeCloseTo(food.calories * .75, 1);
    expect(recipePreview([ingredient("3")], "2", FOODS)!.perServing.calories).toBeCloseTo(preview.perServing.calories * 2, 1);
  });
  it.each(["", " ", "0", "-1", "0.00001", "NaN", "10001"])("does not turn invalid servings %s into a complete preview", servings => {
    expect(recipePreview([ingredient("1")], servings, FOODS)).toBeNull();
  });
  it("rejects empty, unresolved or unsupported ingredients instead of returning a partial total", () => {
    expect(recipePreview([], "1", FOODS)).toBeNull();
    expect(recipePreview([ingredient("")], "1", FOODS)).toBeNull();
    expect(recipePreview([ingredient("0.00001")], "1", FOODS)).toBeNull();
    expect(recipePreview([ingredient("1"), { ...ingredient("1"), food: null }], "1", FOODS)).toBeNull();
    expect(recipePreview([ingredient("1", "buckets")], "1", FOODS)).toBeNull();
    expect(recipePreview([{ ...ingredient("1"), food: { ...food, valueSource: "ai_estimate" } }], "1", [])).toBeNull();
  });
  it("retains explicit zero nutrients and supports a pending custom food", () => {
    expect(recipePreview([{ ...ingredient("1"), food: { ...food, id: "custom", calories: 0, proteinG: 0, carbsG: 0, fatG: 0, valueSource: "user_provided" } }], "1", [])!.perServing).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
  it("requires an explicit conversion instead of treating unit text in a label as servings", () => {
    const labeled = { ...food, unit: "g" as const, servingGrams: 100, servingLabel: "250 ml glass", servingOptions: [] };
    expect(recipeServingPlan(labeled, 100, "ml")).toBeNull();
    expect(recipeServingPlan(labeled, 100, "grams")?.servings).toBe(1);
    expect(recipeServingPlan(labeled, 1.5, "serving")?.servings).toBe(1.5);
    expect(recipeServingPlan({ ...labeled, servingOptions: [{ unit: "cup", label: "1 cup (200 g)", grams: 200 }] }, .5, "cups")?.servings).toBe(1);
    expect(recipeServingPlan({ ...labeled, servingOptions: [{ unit: "cup", label: "250 ml", grams: 200 }] }, 100, "ml")).toBeNull();
  });
  it("supports piece quantities only with a canonical piece basis or explicit piece weight", () => {
    const egg = FOODS.find(candidate => candidate.id === "food-egg")!;
    expect(recipeServingPlan(egg, 3, "piece")?.servings).toBe(3);
    const byWeight = { ...egg, unit: "g" as const, servingLabel: "100 g egg", servingGrams: 100, servingOptions: [] };
    expect(recipeServingPlan(byWeight, 3, "piece")).toBeNull();
    expect(recipeServingPlan({ ...byWeight, servingOptions: [{ unit: "piece", label: "1 egg (50 g)", grams: 50 }] }, 3, "piece")?.servings).toBe(1.5);
  });
});
describe("recipe references", () => {
  it("links only entire safe web URLs", () => {
    expect(safeRecipeReference("https://example.com/recipe")).toBe("https://example.com/recipe");
    for (const text of ["Cookbook, page 22", "javascript:alert(1)", "https://user:pass@example.com", "See https://example.com", ""]) expect(safeRecipeReference(text)).toBeNull();
  });
});
