import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipePortionReview } from "./RecipePortionReview";

const noop = () => {};
const props = {
  name: "Korean Beef Bowl", date: "2026-10-13", slot: "Dinner", servings: "0.5",
  portion: { ingredients: [], nutrition: { calories: 280, proteinG: 22.5, carbsG: 29, fatG: 8 }, canPlan: true, source: "Source-provided recipe macros" },
  changed: false, unavailable: false, pending: false, canPlan: true, error: "",
  onServings: noop, onLog: noop, onPlan: noop, onCancel: noop, onReview: noop, onRefresh: noop,
};
describe("recipe portion review", () => {
  it("shows selected date/slot and authoritative supplied portion nutrition", () => {
    const html = renderToStaticMarkup(<RecipePortionReview {...props} />);
    for (const text of ["2026-10-13", "Dinner", "≈280 kcal", "≈22.5 g protein", "≈29 g carbs", "≈8 g fat", "Log meal", "Add to plan", "Source-provided recipe macros"]) expect(html).toContain(text);
    expect(html).toContain('aria-label="Review recipe servings"');
    expect(html).not.toContain("disabled=");
  });
  it("blocks stale or missing recipes and preserves portions with explicit recovery", () => {
    const changed = renderToStaticMarkup(<RecipePortionReview {...props} changed />);
    expect(changed).toContain("Review updated recipe");
    expect(changed.match(/disabled=""/g)).toHaveLength(2);
    const missing = renderToStaticMarkup(<RecipePortionReview {...props} unavailable portion={null} />);
    expect(missing).toContain("archived or unavailable");
    expect(missing).toContain('value="0.5"');
    expect(missing).toContain("Refresh recipes");
  });
  it("validates invalid amounts and disables controls while saving", () => {
    const invalid = renderToStaticMarkup(<RecipePortionReview {...props} servings="" portion={null} />);
    expect(invalid).toContain('aria-invalid="true"');
    expect(invalid).toContain("Enter a positive number");
    const pending = renderToStaticMarkup(<RecipePortionReview {...props} pending />);
    expect(pending).toContain('aria-busy="true"');
    expect(pending.match(/disabled=""/g)).toHaveLength(4);
  });
  it("allows Log when planning is ineligible and retains failed-save feedback", () => {
    const html = renderToStaticMarkup(<RecipePortionReview {...props} canPlan={false} error="Retry this save" />);
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toContain("You can still log this recipe.");
    expect(html).toContain("Retry this save");
  });
});
