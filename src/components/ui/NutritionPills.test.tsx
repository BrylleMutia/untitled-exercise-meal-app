import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NutritionPills } from "./NutritionPills";

describe("Nutrition summaries", () => {
  it("keeps fractional quantities, labels, and calorie-first order", () => {
    const html = renderToStaticMarkup(<NutritionPills label="Nutrition preview" values={{ fatG: 10.6, carbsG: 1.1, proteinG: 12.6, calories: 155 }} />);
    expect(html).toContain('aria-label="Nutrition preview"');
    expect(html).toMatch(/155 kcal.*12.6 g protein.*1.1 g carbs.*10.6 g fat/);
    expect(html).not.toContain("tabindex");
  });

  it("distinguishes explicit zero from missing and invalid intake", () => {
    const html = renderToStaticMarkup(<NutritionPills values={{ calories: 0, proteinG: null, carbsG: Number.NaN, fatG: -1 }} />);
    expect(html).toContain("0 kcal");
    expect(html).toContain("Protein not logged");
    expect(html).toContain("Carbs unavailable");
    expect(html).toContain("Fat unavailable");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("0 g protein");
  });

  it("supports calorie-only summaries and existing rounded estimates", () => {
    const html = renderToStaticMarkup(<NutritionPills values={{ calories: 458.6 }} approximate precision={0} />);
    expect(html).toContain("≈459 kcal");
    expect(html).not.toContain("protein");
    expect(html).not.toContain("undefined");
  });

  it("offers compact mobile macros with full accessible names and unchanged precision", () => {
    const html = renderToStaticMarkup(<NutritionPills abbreviateOnMobile compactOnMobile approximate precision={1} values={{ calories: 1020.8, proteinG: 45.54, carbsG: 78.8, fatG: 57.7 }} />);
    expect(html).toContain("≈1020.8 kcal");
    for (const text of ["P ≈45.5g", "C ≈78.8g", "F ≈57.7g", "Protein: approximately 45.5 grams", "Carbs: approximately 78.8 grams", "Fat: approximately 57.7 grams", "≈45.5 g protein"]) expect(html).toContain(text);
    expect(html).not.toContain("45.54");
    expect(html).toMatch(/aria-hidden="true">P ≈45.5g/);
  });

  it("opts into a single-line strip without changing nutrition semantics", () => {
    const html = renderToStaticMarkup(<NutritionPills scrollable abbreviateOnMobile compactOnMobile approximate precision={1} values={{ calories: 1020.8, proteinG: 45.54, carbsG: null, fatG: 0 }} />);
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("data-nutrition-strip");
    expect(html).toContain("shrink-0 whitespace-nowrap");
    expect(html).toContain("P ≈45.5g");
    expect(html).toContain("Protein: approximately 45.5 grams");
    expect(html).toContain("Carbs not logged");
    expect(html).toContain("F ≈0g");
    expect(html).not.toContain("tabindex");
  });

  it("retains explicit unknown labels and treats zero as a known compact value", () => {
    const html = renderToStaticMarkup(<NutritionPills abbreviateOnMobile values={{ proteinG: 0, carbsG: null, fatG: Number.NaN }} />);
    expect(html).toContain("P 0g"); expect(html).toContain("Protein: 0 grams");
    expect(html).toContain("Carbs not logged"); expect(html).toContain("Fat unavailable");
    expect(html).not.toContain("C 0g"); expect(html).not.toContain("NaN");
  });
});
