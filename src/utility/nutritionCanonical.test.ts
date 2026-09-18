import { describe, expect, it } from "vitest";
import { calculateNutrients, canonicalFromLabeledServing } from "./nutritionCanonical";

describe("canonical nutrition calculations", () => {
  it("scales trusted per-100-g values by gram equivalent", () => {
    expect(calculateNutrients(
      { quantity: 1.5, gramsPerUnit: 40 },
      { calories: 250, proteinG: 20, carbsG: 10, fatG: 8, fiberG: 5 },
    )).toEqual({ grams: 60, calories: 150, proteinG: 12, carbsG: 6, fatG: 4.8, fiberG: 3 });
  });

  it("preserves zero-valued nutrients", () => {
    expect(calculateNutrients(
      { quantity: 1, gramsPerUnit: 5 },
      { calories: 40, proteinG: 0, carbsG: 0, fatG: 4.5 },
    )).toEqual({ grams: 5, calories: 2, proteinG: 0, carbsG: 0, fatG: 0.23 });
  });

  it("rejects missing gram equivalents instead of guessing", () => {
    expect(() => calculateNutrients({ quantity: 1, gramsPerUnit: 0 }, { calories: 1, proteinG: 0, carbsG: 0, fatG: 0 })).toThrow();
  });

  it("can normalize the legacy labeled fixture without changing preparation state", () => {
    expect(canonicalFromLabeledServing(50, { calories: 72, proteinG: 6.3, carbsG: 0.4, fatG: 4.8 })).toEqual({
      calories: 144,
      proteinG: 12.6,
      carbsG: 0.8,
      fatG: 9.6,
    });
  });
});
