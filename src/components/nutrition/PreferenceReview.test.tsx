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


describe("collapsible generation warnings", () => {
  const multiple: PreferenceReview = { ...review, recipeWarnings: [...review.recipeWarnings, { code: "cooking-time-unknown", recipeId: "second", recipeRevision: 1, recipeName: "Second recipe", message: "Second warning" }] };
  it("starts the whole recipe review collapsed and includes every recipe and message", () => {
    const html = renderToStaticMarkup(<RecipeWarningReview collapsible review={multiple} onRemove={() => {}} />);
    expect(html).toContain("Sesame seeds");
    expect(html).toContain("Cooking time is not set.");
    expect(html).toContain("Second warning");
    expect(html).toContain("(2 recipes)");
    expect(html).toContain("<summary");
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
    expect(html).toContain('aria-label="Collapse all recipe warnings"');
    expect(html).not.toContain("See more..");
  });
  it("omits empty sections, still discloses one recipe and keeps historical reviews complete", () => {
    expect(renderToStaticMarkup(<RecipeWarningReview collapsible review={{ ...review, recipeWarnings: [] }} />)).toBe("");
    expect(renderToStaticMarkup(<RecipeWarningReview collapsible review={review} />)).toContain("(1 recipe)");
    const historical = renderToStaticMarkup(<RecipeWarningReview review={multiple} />);
    expect(historical).toContain("Second warning");
    expect(historical).not.toContain("<details");
    expect(historical).not.toContain("Collapse all");
  });
  it("counts affected days, retains unavailable nutrition, and opts historical daily reviews out", () => {
    const daily = { ...review, dailyWarnings: [...review.dailyWarnings, { ...review.dailyWarnings[0], date: "2026-10-23" }] };
    const html = renderToStaticMarkup(<DailyWarningReview collapsible review={daily} />);
    expect(html).toContain("(2 days)");
    expect(html).toContain("cannot be assessed reliably");
    expect(html).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
    expect(html).toContain('aria-label="Collapse all daily preference warnings"');
    expect(renderToStaticMarkup(<DailyWarningReview collapsible review={review} />)).toContain("(1 day)");
    expect(renderToStaticMarkup(<DailyWarningReview collapsible review={{ ...review, dailyWarnings: [] }} />)).toBe("");
    expect(renderToStaticMarkup(<DailyWarningReview review={daily} />)).not.toContain("<details");
  });
});
