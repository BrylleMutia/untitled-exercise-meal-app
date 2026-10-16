import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeConversionConfirmation } from "./RecipeConversionConfirmation";
import { FOODS } from "@/constants/foods";
import type { RecipeIngredientDraft } from "@/utility/recipeEditor";
const food = FOODS.find(food => food.id === "food-egg")!;
const base: RecipeIngredientDraft = { id: "egg", name: "Egg", food, unit: "g", quantity: "100", included: true, assumptions: [], pendingConversion: { unit: "cup", gramsPerUnit: "" } };
const html = (patch: Partial<RecipeIngredientDraft> = {}) => renderToStaticMarkup(<RecipeConversionConfirmation item={{ ...base, ...patch }} food={food} onChange={() => {}} />);
describe("conversion confirmation presentation", () => {
  it("retains the original amount and labels the required gram weight", () => {
    expect(html()).toContain("100"); expect(html()).toContain("original amount stays unchanged");
    expect(html()).toContain('aria-label="Egg conversion grams per cup"');
    expect(html()).toContain("Cancel conversion"); expect(html()).toMatch(/disabled=""[^>]*>Confirm conversion/);
  });
  it("previews the converted range only after a valid factor", () => {
    const markup = html({ measurementKind: "range", upperQuantity: "150", pendingConversion: { unit: "cup", gramsPerUnit: "100" } });
    expect(markup).toContain("≈1–1.5 cup"); expect(markup).toContain("Nutrition keeps the same ingredient weight");
  });
  it("rejects invalid factors without showing a converted amount", () => {
    for (const gramsPerUnit of ["0", "-1", "Infinity", "1000001"]) {
      const markup = html({ pendingConversion: { unit: "cup", gramsPerUnit } });
      expect(markup).toContain("positive finite weight"); expect(markup).not.toContain("Converted quantity");
    }
  });
});
