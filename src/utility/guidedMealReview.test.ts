import { describe, expect, it } from "vitest";
import { guidedMacros, photoEstimateFood, photoFoodMatch, photoPreview, photoRange, photoReviewedEntry, reviewReady, type GuidedIngredient } from "./guidedMealReview";
import type { Food } from "@/types/domain";
const food: Food = { id: "rice", name: "Cooked rice", category: "Grains", unit: "g", servingGrams: 100, servingLabel: "100 g", calories: 130, proteinG: 3, carbsG: 28, fatG: 0.3, source: "USDA", sourceVersion: "test-v1", valueSource: "trusted_catalog", confidence: "high", estimated: false };
const item: GuidedIngredient = { id: "one", name: "rice", quantity: 200, unit: "g", preparation: "cooked", assumptions: [], presence: "stated", included: true, food, photo: { portion: { low: 150, base: 200, high: 250, unit: "g" }, reviewed: false } };
describe("photo-derived meal review", () => {
  it("chooses a relevant food over the top USDA search result and leaves unrelated results unresolved", () => {
    const lamb = { ...food, id: "lamb", name: "Lamb, chop" };
    const sandwich = { ...food, id: "sandwich", name: "Egg salad sandwich on white" };
    expect(photoFoodMatch("herbs", [lamb])).toBeNull();
    expect(photoFoodMatch("egg salad sandwich", [lamb, sandwich])).toEqual(sandwich);
  });
  it("calculates portion ranges from catalog data and never promotes photo confidence", () => {
    expect(photoRange(item)?.calories).toEqual({ low: 195, base: 260, high: 325 });
    expect(photoEstimateFood(item, "saved")).toMatchObject({ estimated: true, confidence: "low", valueSource: "ai_estimate", servingGrams: 200, calories: 260, estimateRange: { calories: { low: 195, base: 260, high: 325 } } });
    expect(food.estimated).toBe(false);
  });
  it("requires a review of every included photo item", () => {
    expect(reviewReady([item])).toBe(false);
    expect(reviewReady([{ ...item, photo: { ...item.photo!, reviewed: true } }])).toBe(true);
    expect(reviewReady([{ ...item, photo: { ...item.photo!, reviewed: true } }, { ...item, id: "two" }])).toBe(false);
  });
  it("saves one whole reviewed portion with its source and range, without multiplying it twice", () => {
    const entry = photoReviewedEntry(item, "2026-11-23", "lunch");
    expect(entry).toMatchObject({ servings: 1, servingGrams: 200, servingQuantity: 200, calories: 260,
      confidence: "low", estimated: true, valueSource: "ai_estimate", estimateRange: { calories: { low: 195, base: 260, high: 325 } } });
    expect(entry?.assumptions).toContain("USDA test-v1; record rice");
    expect(entry).not.toHaveProperty("foodId"); expect(entry).not.toHaveProperty("image");
  });
  it("does not treat unknown amounts or unsupported units as a serving", () => {
    for (const invalid of [{ ...item, quantity: 0 }, { ...item, unit: "bucket" }]) {
      expect(guidedMacros(invalid)).toBeNull();
      expect(photoRange(invalid)).toBeNull();
      expect(reviewReady([invalid])).toBe(false);
    }
  });
  it("excludes hidden items and labels partial estimates instead of silently counting unknowns as zero", () => {
    const preview = photoPreview([item, { ...item, name: "sauce", food: null }, { ...item, name: "oil", included: false }]);
    expect(preview).toMatchObject({ known: 1, partial: true, missing: ["sauce"], total: { calories: { base: 260 } } });
  });
  it("recalculates corrected amounts without retaining obsolete photo bounds", () => {
    expect(photoRange({ ...item, quantity: 100 })?.calories).toEqual({ low: 130, base: 130, high: 130 });
  });
  it("validates custom input and keeps explicit AI estimates as whole-portion values", () => {
    expect(guidedMacros({ ...item, food: null, custom: { calories: "", proteinG: "1", carbsG: "2", fatG: "3", fiberG: "" } })).toBeNull();
    const range = photoRange(item)!;
    expect(guidedMacros({ ...item, food: null, estimate: { calories: 260, proteinG: 6, carbsG: 56, fatG: 0.6, estimateRange: range, assumptions: [] } })?.calories).toBe(260);
  });
});
