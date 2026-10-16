import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SavedRecipePlanReview } from "./SavedRecipePlanReview";
import { FOODS } from "@/constants/foods";
import type { Meal, PlannedMeal } from "@/types/domain";

const recipe: Meal = { id: "beef", name: "Korean Beef Bowl", servings: 4,
  ingredients: [{ foodId: FOODS[0].id, servings: 1 }],
  providedNutrition: { calories: 560, proteinG: 45, carbsG: 58, fatG: 16 } };
const props = { recipe, name: recipe.name, foods: FOODS, date: "2026-10-13", canPlan: true,
  carbLimited: false, pending: false, createPlan: () => ({} as PlannedMeal), onPlan: async () => true,
  onSavingChange: () => {}, onClose: () => {}, onRefresh: () => {} };

describe("Saved recipe planning review", () => {
  it("requires an explicit slot and previews one serving rather than the entire yield", () => {
    const html = renderToStaticMarkup(<SavedRecipePlanReview {...props} />);
    expect(html).toContain("Choose a slot");
    expect(html).toContain('value="1"');
    expect(html).toContain("≈560 kcal");
    expect(html).not.toContain("2240 kcal");
    expect(html).not.toContain("Log meal");
    expect(html).toContain("Add to plan");
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
  it("keeps unavailable or incomplete recipes unsavable", () => {
    const unavailable = renderToStaticMarkup(<SavedRecipePlanReview {...props} recipe={undefined} />);
    expect(unavailable).toContain("archived or unavailable");
    expect(unavailable).toContain("Korean Beef Bowl");
    const incomplete = renderToStaticMarkup(<SavedRecipePlanReview {...props} foods={[]} />);
    expect(incomplete).toContain("Resolve missing or invalid ingredients");
    expect(incomplete).not.toContain("≈560 kcal");
  });
  it("disables slot, serving and cancellation controls during a pending mutation", () => {
    const html = renderToStaticMarkup(<SavedRecipePlanReview {...props} pending />);
    expect(html.match(/disabled=""/g)).toHaveLength(4);
    expect(html).toContain('aria-busy="true"');
  });
});
