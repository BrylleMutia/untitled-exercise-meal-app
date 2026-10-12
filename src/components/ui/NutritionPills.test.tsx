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
});
