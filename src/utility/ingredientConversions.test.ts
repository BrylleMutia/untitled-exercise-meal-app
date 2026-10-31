import { describe, expect, it } from "vitest";
import { savedConversionChoices, savedRecipeUnitConversion } from "./ingredientConversions";
import { ingredientDraftServing, recipeIngredientDraft, recipePreview, recipeUnitConversion, patchRecipeIngredient, type RecipeIngredientDraft } from "./recipeEditor";
import { parseCookingMeasurement } from "./cookingMeasurement";
import { FOODS } from "@/constants/foods";
import type { IngredientConversionCandidate } from "@/types/backend";

const food = FOODS.find(item => item.id === "food-egg")!;
const draft: RecipeIngredientDraft = { id: "egg", name: "Egg", food, quantity: "100", unit: "g", included: true, assumptions: [] };
const candidate = (gramsPerUnit: number, unit = "cup", kind: IngredientConversionCandidate["source"]["kind"] = "personal"): IngredientConversionCandidate => ({ foodId: food.id, unit, gramsPerUnit, source: { kind, recipeName: "Saved eggs" } });

describe("remembered recipe conversions", () => {
  it("uses one saved factor without changing nutrition weight or range bounds", () => {
    const item = { ...draft, measurementKind: "range" as const, upperQuantity: "200" };
    const result = savedRecipeUnitConversion(item, food, "cups", [candidate(50)]);
    expect(result.status).toBe("converted");
    if (result.status !== "converted") throw new Error(result.status);
    expect(result.usedSaved).toBe(true);
    expect(result.patch).toMatchObject({ quantity: "2", upperQuantity: "4", unit: "cup" });
    expect(ingredientDraftServing({ ...item, ...result.patch }, food)?.servings).toBe(ingredientDraftServing(item, food)?.servings);
  });
  it("deduplicates equivalent volume bases and keeps source descriptions", () => {
    const choices = savedConversionChoices([candidate(15, "tbsp"), candidate(5.00000001, "tsp", "group"), candidate(240, "cup", "default")], food.id, "ml");
    expect(choices).toHaveLength(1);
    expect(choices[0].gramsPerUnit).toBe(1);
    expect(choices[0].sources).toHaveLength(3);
  });
  it("requires a choice for different saved weights even with a trusted food measure", () => {
    const result = savedRecipeUnitConversion(draft, { ...food, servingOptions: [{ label: "1 cup", unit: "cup", grams: 100 }] }, "cup", [candidate(80), candidate(120)]);
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") expect(result.choices.map(choice => choice.gramsPerUnit)).toEqual([80, 120]);
  });
  it("preserves explicit ingredient factors over different library and canonical piece weights", () => {
    const item = { ...draft, gramsPerUnit: "1", conversionBases: [{ unit: "piece", gramsPerUnit: 25 }] };
    const result = savedRecipeUnitConversion(item, food, "piece", [candidate(50, "piece"), candidate(75, "piece")]);
    expect(result.status).toBe("converted");
    if (result.status === "converted") expect(result.patch.quantity).toBe("4");
  });
  it("freezes the known source weight when borrowing an alternate target factor", () => {
    const counted = { ...food, unit: "piece" as const, servingGrams: 50 };
    const item = { ...draft, food: counted, quantity: "2", unit: "piece" };
    const result = savedRecipeUnitConversion(item, counted, "cup", [candidate(75, "piece"), candidate(100, "cup")]);
    expect(result.status).toBe("converted");
    if (result.status === "converted") {
      expect(result.patch.quantity).toBe("1");
      expect(ingredientDraftServing({ ...item, ...result.patch }, counted)?.servings).toBe(2);
    }
  });
  it("does not borrow a same-named food's conversion or infer piece weight from volume", () => {
    expect(savedConversionChoices([{ ...candidate(50), foodId: "other-egg" }], food.id, "cup")).toEqual([]);
    expect(savedConversionChoices([candidate(50)], food.id, "piece")).toEqual([]);
  });
  it("retains every completed alternate basis across recipe save and reopen", () => {
    const cup = recipeUnitConversion(draft, food, "cup", { unit: "cup", gramsPerUnit: 100 });
    if (cup.status !== "converted") throw new Error(cup.status);
    const piece = recipeUnitConversion({ ...draft, ...cup.patch }, food, "piece", { unit: "piece", gramsPerUnit: 25 });
    if (piece.status !== "converted") throw new Error(piece.status);
    const saved = recipePreview([{ ...draft, ...piece.patch }], "2", [food]);
    expect(saved).not.toBeNull();
    const reopened = recipeIngredientDraft(saved!.ingredients[0], food, "reopened");
    expect(reopened.conversionBases).toEqual(expect.arrayContaining([{ unit: "cup", gramsPerUnit: 100 }, { unit: "piece", gramsPerUnit: 25 }]));
    expect(parseCookingMeasurement(saved!.ingredients[0].cookingMeasurement)).not.toBeNull();
  });
  it("keeps conflict confirmation pending until the user explicitly selects or confirms", () => {
    const changed = patchRecipeIngredient(draft, { pendingConversion: { unit: "piece", factorUnit: "piece", gramsPerUnit: "" } });
    expect(changed.unit).toBe("g");
    expect(changed.pendingConversion?.factorUnit).toBe("piece");
  });
  it("preserves known ingredient weight when replacing the current unit's factor", () => {
    const item = { ...draft, quantity: "2", unit: "cup", gramsPerUnit: "80" };
    const result = recipeUnitConversion(item, food, "cup", { unit: "cup", gramsPerUnit: 120 });
    expect(result.status).toBe("converted");
    if (result.status === "converted") expect(Number(result.patch.quantity) * Number(result.patch.gramsPerUnit)).toBeCloseTo(160, 10);
  });
  it.each([0, -1, Infinity, NaN, 1000001])("rejects an invalid saved factor %s", gramsPerUnit => {
    expect(parseCookingMeasurement({ kind: "amount", quantity: 100, unit: "g", conversionBases: [{ unit: "cup", gramsPerUnit }] })).toBeNull();
    expect(savedConversionChoices([candidate(gramsPerUnit)], food.id, "cup")).toEqual([]);
  });
});
