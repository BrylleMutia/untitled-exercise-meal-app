import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PhotoMealPreview } from "./PhotoMealPreview";
import type { GuidedIngredient } from "@/utility/guidedMealReview";

describe("photo preview states", () => {
  it("shows uncertainty and incomplete nutrition without exposing a save action", () => {
    const item: GuidedIngredient = { id: "one", name: "Mixed dish", quantity: 0, unit: "g", preparation: "unknown", assumptions: [], presence: "stated", included: true, food: null };
    const html = renderToStaticMarkup(<PhotoMealPreview items={[item]} questions={["How much sauce?"]} loading={false} onReview={() => {}} />);
    for (const text of ["Partial estimate", "Low confidence", "amount unknown", "How much sauce?", "Review meal", "not a complete meal estimate"]) expect(html).toContain(text);
    expect(html).not.toContain("Log meal"); expect(html).not.toContain("0 kcal");
  });
  it("disables review while matching is in flight", () => {
    const html = renderToStaticMarkup(<PhotoMealPreview items={[]} questions={[]} loading onReview={() => {}} />);
    expect(html).toContain("Matching meal ingredients"); expect(html).toContain('disabled=""');
  });
});
