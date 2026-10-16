import { describe, expect, it } from "vitest";
import { FOODS } from "@/constants/foods";
import { KOREAN_BEEF_BOWL } from "@/constants/koreanBeefBowl";
import { CREAMY_LEMON_CHICKEN } from "@/constants/creamyLemonChicken";
import { cookingGramsPerUnit, needsRecipeMeasurementRefresh, normalizeCookingUnit } from "./cookingMeasurement";
import { ingredientDraftServing, prepareRecipeIngredient, recipeAuthoringUnits, recipeIngredientDraft, recipeUnitConversion, type RecipeIngredientDraft } from "./recipeEditor";

function draft(index: number, recipe = KOREAN_BEEF_BOWL) {
  const ingredient = recipe.ingredients[index];
  return recipeIngredientDraft(ingredient, FOODS.find(food => food.id === ingredient.foodId)!, String(index));
}
function convert(item: RecipeIngredientDraft, unit: string) {
  const result = recipeUnitConversion(item, item.food!, unit);
  if (result.status !== "converted") throw new Error(result.status);
  return { ...item, ...result.patch };
}
describe("quantity-preserving cooking conversions", () => {
  it("restricts authoring units while converting saved count, volume, weight and serving units", () => {
    expect(recipeAuthoringUnits).toEqual(["g", "kg", "mg", "oz", "ml", "tsp", "tbsp", "cup", "piece"]);
    for (const index of [5, 7, 8]) {
      const original = draft(index), prepared = prepareRecipeIngredient(original);
      expect(prepared.unit).toBe("piece");
      expect(prepared.quantity).toBe(original.quantity);
      expect(ingredientDraftServing(prepared, prepared.food!)?.servings).toBeCloseTo(ingredientDraftServing(original, original.food!)!.servings, 12);
      expect(prepareRecipeIngredient(prepared)).toEqual(prepared);
    }
    const cup = convert(draft(3), "cup"), preparedCup = prepareRecipeIngredient(cup);
    expect(preparedCup).toMatchObject({ unit: "cup", quantity: String(1 / 16) });
    expect(ingredientDraftServing(preparedCup, preparedCup.food!)?.servings).toBeCloseTo(0.21, 12);
    expect(Number(prepareRecipeIngredient(convert(draft(0), "lb")).quantity)).toBeCloseTo(600 / 28.349523125, 10);
    expect(prepareRecipeIngredient({ ...draft(0), unit: "serving", quantity: "2", gramsPerUnit: undefined })).toMatchObject({ unit: "g", quantity: "200" });
  });
  it("converts volume suggestions without a food or an invented density", () => {
    const original = { ...draft(0), food: null, unit: "cups", quantity: "3", upperQuantity: "4", measurementKind: "range" as const, gramsPerUnit: undefined };
    const prepared = prepareRecipeIngredient(original);
    expect(prepared).toMatchObject({ unit: "cup", quantity: "3", upperQuantity: "4" });
    expect(recipeUnitConversion(prepared, null, "ml")).toMatchObject({ status: "converted", patch: { quantity: "720", upperQuantity: "960" } });
    expect(prepared.gramsPerUnit).toBeUndefined();
    expect(recipeUnitConversion(prepared, null, "g")).toEqual({ status: "confirmation", factorUnit: "cup" });
  });
  it("keeps unknown source amounts through cancellation and source-weight confirmation", () => {
    const source = { ...draft(0), unit: "buckets", quantity: "2", gramsPerUnit: undefined };
    const prepared = prepareRecipeIngredient(source);
    expect(prepared).toMatchObject({ unit: "buckets", quantity: "2", pendingConversion: { unit: "g", gramsPerUnit: "" } });
    const cancelled = prepareRecipeIngredient({ ...prepared, pendingConversion: undefined }, prepared.food, false);
    expect(cancelled.unit).toBe("buckets"); expect(cancelled.pendingConversion).toBeUndefined();
    const confirmed = recipeUnitConversion(prepared, prepared.food, "g", { unit: "buckets", gramsPerUnit: 170 });
    expect(confirmed).toMatchObject({ status: "converted", patch: { unit: "g", quantity: "340" } });
  });
  it("recovers excluded pending target units and entered factors without losing provisional bases", () => {
    const prepared = prepareRecipeIngredient({ ...draft(0), pendingConversion: { unit: "l", gramsPerUnit: "1000", bases: [{ unit: "bucket", gramsPerUnit: 10 }] } });
    expect(prepared.pendingConversion).toEqual({ unit: "ml", gramsPerUnit: "1", bases: [{ unit: "bucket", gramsPerUnit: 10 }] });
    expect(recipeUnitConversion(prepared, prepared.food, "ml", { unit: "ml", gramsPerUnit: Number(prepared.pendingConversion!.gramsPerUnit) })).toMatchObject({ status: "converted", patch: { quantity: "600", unit: "ml" } });
    expect(prepareRecipeIngredient(prepared)).toEqual(prepared);
    const known = prepareRecipeIngredient({ ...convert(draft(3), "cup"), pendingConversion: { unit: "cup", gramsPerUnit: "21" } });
    expect(known.unit).toBe("cup"); expect(known.pendingConversion).toBeUndefined();
    expect(ingredientDraftServing(known, known.food!)?.servings).toBeCloseTo(0.21, 12);
  });
  it("converts soy sauce tablespoons to teaspoons and back without nutrition drift", () => {
    const soy = draft(2);
    const spoon = convert(soy, "tsp.");
    expect(Number(spoon.quantity)).toBe(6);
    expect(ingredientDraftServing(spoon, spoon.food!)?.servings).toBeCloseTo(0.32, 12);
    let current = spoon;
    for (let index = 0; index < 50; index++) current = convert(convert(current, "g"), "tablespoons");
    expect(Number(current.quantity)).toBeCloseTo(2, 12);
    expect(ingredientDraftServing(current, current.food!)?.servings).toBeCloseTo(0.32, 12);
  });
  it("derives honey teaspoons and 240-ml cups from its saved tablespoon weight", () => {
    const honey = draft(3);
    expect(Number(convert(honey, "tsp").quantity)).toBe(3);
    expect(Number(convert(honey, "cup").quantity)).toBe(1 / 16);
    expect(Number(convert(honey, "ml").quantity)).toBe(15);
    expect(convert(honey, "cup").cookingText).toBeUndefined();
  });
  it("keeps an explicit target measure ahead of a derived volume conversion", () => {
    const honey = { ...draft(3), conversionBases: [{ unit: "cup", gramsPerUnit: 300 }] };
    expect(Number(convert(honey, "cup").quantity)).toBe(21 / 300);
  });
  it("normalizes supported weight and volume aliases", () => {
    expect(normalizeCookingUnit("L")).toBe("l"); expect(normalizeCookingUnit("tablespoons")).toBe("tbsp");
    const beef = draft(0);
    expect(Number(convert(beef, "kg").quantity)).toBe(0.6);
    expect(Number(convert(convert(beef, "lb"), "g").quantity)).toBeCloseTo(600, 10);
    expect(Number(convert(beef, "mg").quantity)).toBe(600000);
  });
  it("normalizes an explicit 100 ml serving and preserves milk weight", () => {
    const milk = draft(3, CREAMY_LEMON_CHICKEN);
    expect(cookingGramsPerUnit("ml", milk.food!)).toBe(1.03);
    const cup = convert(milk, "cup");
    expect(Number(cup.quantity)).toBe(1.25);
    expect(ingredientDraftServing(cup, cup.food!)?.servings).toBeCloseTo(3.09, 12);
  });
  it("converts both range bounds using the upper value for nutrition", () => {
    const butter = draft(1, CREAMY_LEMON_CHICKEN);
    const ounces = convert(butter, "oz");
    const restored = convert(ounces, "g");
    expect(Number(restored.quantity)).toBeCloseTo(25, 12); expect(Number(restored.upperQuantity)).toBeCloseTo(30, 12);
    expect(ingredientDraftServing(ounces, ounces.food!)?.servings).toBeCloseTo(0.3, 12);
  });
  it("retains the original measurement until an unavailable conversion is confirmed", () => {
    const beef = draft(0);
    expect(recipeUnitConversion(beef, beef.food!, "cup")).toEqual({ status: "confirmation", factorUnit: "cup" });
    expect(beef.quantity).toBe("600"); expect(beef.unit).toBe("g");
    const result = recipeUnitConversion(beef, beef.food!, "cup", { unit: "cup", gramsPerUnit: 200 });
    expect(result).toMatchObject({ status: "converted", patch: { quantity: "3", unit: "cup", gramsPerUnit: "200" } });
  });
  it("handles unknown source units, invalid factors, invalid ranges and limits safely", () => {
    const unknown = { ...draft(0), unit: "bucket", gramsPerUnit: undefined };
    expect(recipeUnitConversion(unknown, unknown.food!, "g")).toMatchObject({ status: "confirmation", factorUnit: "bucket" });
    expect(recipeUnitConversion(draft(0), draft(0).food!, "cup", { unit: "cup", gramsPerUnit: Infinity })).toMatchObject({ status: "confirmation" });
    const reversed = { ...draft(1, CREAMY_LEMON_CHICKEN), upperQuantity: "24" };
    expect(recipeUnitConversion(reversed, reversed.food!, "oz").status).toBe("invalid");
    expect(recipeUnitConversion({ ...draft(0), quantity: "Infinity" }, draft(0).food!, "kg").status).toBe("invalid");
    expect(recipeUnitConversion({ ...draft(0), quantity: "1000000" }, draft(0).food!, "mg").status).toBe("invalid");
  });
  it("preserves optional notes and count units without inventing conversions", () => {
    const ginger = draft(6);
    expect(convert(ginger, "tbsp")).toMatchObject({ optional: true });
    const garlic = draft(5);
    expect(Number(convert(garlic, "g").quantity)).toBe(6);
    expect(Number(convert(convert(garlic, "g"), "cloves").quantity)).toBe(2);
    expect(recipeUnitConversion(garlic, garlic.food!, "cup").status).toBe("confirmation");
  });
  it("refreshes only known predefined recipes missing original metadata", () => {
    expect(needsRecipeMeasurementRefresh(KOREAN_BEEF_BOWL)).toBe(false);
    const legacy = { ...KOREAN_BEEF_BOWL, ingredients: KOREAN_BEEF_BOWL.ingredients.map(({ foodId, servings }) => ({ foodId, servings })) };
    expect(needsRecipeMeasurementRefresh(legacy)).toBe(true);
    expect(needsRecipeMeasurementRefresh({ ...legacy, isSystem: false })).toBe(false);
    expect(needsRecipeMeasurementRefresh({ ...legacy, id: "unrelated" })).toBe(false);
  });
});
