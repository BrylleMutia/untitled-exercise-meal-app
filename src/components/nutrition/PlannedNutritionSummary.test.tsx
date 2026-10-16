import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PlannedNutritionSummary } from "./PlannedNutritionSummary";
import { plannedDayNutrition } from "@/utility/plannedDayNutrition";
import type { PlannedMeal } from "@/types/domain";
const meal: PlannedMeal = { id: "beef", date: "2026-10-13", slot: "lunch", mealId: "beef", label: "Beef", servings: 0.5, expectedCalories: 280, expectedProteinG: 22.5, expectedCarbsG: 29, expectedFatG: 8 };
describe("Planned nutrition presentation", () => {
  it("uses the remaining calorie ring beside the heading and the three shared macro bars", () => {
    const target = { calories: 2000, proteinG: 120, carbsG: 220, fatG: 65 } as Parameters<typeof PlannedNutritionSummary>[0]["target"];
    const html = renderToStaticMarkup(<PlannedNutritionSummary summary={plannedDayNutrition([meal], meal.date)} target={target} />);
    expect(html).toContain('aria-label="Approximately 1720 planned calories remaining to the estimated target"');
    expect(html).toContain("kcal to target");
    expect(html.match(/role="progressbar"/g)).toHaveLength(3);
    expect(html).not.toContain("kcal left");
    const partial = renderToStaticMarkup(<PlannedNutritionSummary summary={plannedDayNutrition([meal, { ...meal, id: "incomplete", expectedCalories: undefined, expectedProteinG: undefined }], meal.date)} target={target} />);
    expect(partial).toContain("Planned calorie total is incomplete");
    expect(partial.match(/role="progressbar"/g)).toHaveLength(2);
  });
  it("shows portion totals with fractional macros and without intake language", () => {
    const html = renderToStaticMarkup(<PlannedNutritionSummary summary={plannedDayNutrition([meal], meal.date)} target={null} />);
    expect(html).toContain("280 kcal planned"); expect(html).toContain("22.5 g"); expect(html).not.toContain("logged"); expect(html).not.toContain('role="progressbar"');
  });
  it("distinguishes no plan from an entirely skipped day", () => {
    expect(renderToStaticMarkup(<PlannedNutritionSummary summary={plannedDayNutrition([], meal.date)} target={null} />)).toContain("No meals planned.");
    expect(renderToStaticMarkup(<PlannedNutritionSummary summary={plannedDayNutrition([{ ...meal, skipped: true }], meal.date)} target={null} />)).toContain("No active meals planned.");
  });
  it("labels incomplete subtotals and missing metrics truthfully", () => {
    const summary = plannedDayNutrition([{ ...meal, expectedProteinG: undefined }, { ...meal, id: "unknown", mealId: undefined }], meal.date);
    const html = renderToStaticMarkup(<PlannedNutritionSummary summary={summary} target={null} />);
    expect(html).toContain("Partial total"); expect(html).toContain("Unavailable"); expect(html).not.toContain('role="progressbar"');
  });
});
