import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PreferenceReview } from "@/types/planningPreferences";
import { DailyWarningReview, RecipeWarningReview, planningAcknowledgment } from "./PreferenceReview";

const review: PreferenceReview = {
  policyVersion: "advisory_v1",
  recipeWarnings: [
    { code: "avoided-food", recipeId: "selected-unused", recipeRevision: 2, recipeName: "Selected recipe", message: "Your foods to avoid (sesame) may match: Sesame seeds." },
    { code: "cooking-time-unknown", recipeId: "selected-unused", recipeRevision: 2, recipeName: "Selected recipe", message: "Cooking time is not set." },
  ],
  dailyWarnings: [{ code: "daily-carbohydrate", date: "2026-10-22", totalCarbs: null, limit: 50, recipeIds: ["selected-unused"], recipeNames: { "selected-unused": "Selected recipe" }, message: "Nutrition is incomplete; your carbohydrate preference cannot be assessed reliably." }],
};

describe("preference review presentation", () => {
  it("groups selected unused recipe warnings and exposes one removal action", () => {
    const html = renderToStaticMarkup(<RecipeWarningReview review={review} onRemove={() => {}} />);
    expect(html).toContain("Warnings do not exclude these recipes");
    expect(html.match(/aria-label="Remove recipe:/g)).toHaveLength(1);
    expect(html).toContain("bg-danger-100 text-danger-900");
    expect(html).toContain("Sesame seeds");
    expect(html).toContain("Cooking time is not set.");
    expect(html).not.toContain('type="checkbox"');
  });
  it("keeps historical reviews read-only and unknown daily totals explicit", () => {
    const html = renderToStaticMarkup(<><RecipeWarningReview review={review} /><DailyWarningReview review={review} /></>);
    expect(html).not.toContain("Remove recipe:");
    expect(html).toContain("cannot be assessed reliably");
    expect(html).toContain("Recipes: Selected recipe");
    expect(html).not.toContain("selected-unused");
    expect(planningAcknowledgment).toContain("allergy and dietary conflicts");
    expect(planningAcknowledgment).toContain("unused servings");
  });
});
