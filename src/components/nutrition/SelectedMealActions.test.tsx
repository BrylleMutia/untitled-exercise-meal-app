import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectedMealActions } from "./SelectedMealActions";
import { MealEntryWarnings } from "./MealEntryWarnings";
const props = { pending: false, valid: true, canPlan: true, onLog() {}, onPlan() {}, onChange() {} };
describe("direct selected meal actions", () => {
  it("offers immediate log and plan with a separate change-selection action", () => {
    const html = renderToStaticMarkup(<SelectedMealActions {...props} />);
    for (const label of ["Log meal", "Add to plan", "Change selection"]) expect(html).toContain(label);
    for (const label of ["Review meal", "Cancel", "disabled="]) expect(html).not.toContain(label);
    expect(html.indexOf("Log meal")).toBeLessThan(html.indexOf("Add to plan"));
  });
  it("locks competing actions while saving and explains structural blockers", () => {
    expect(renderToStaticMarkup(<SelectedMealActions {...props} pending />).match(/disabled=""/g)).toHaveLength(3);
    const invalid = renderToStaticMarkup(<SelectedMealActions {...props} valid={false} blocked="Resolve missing nutrition before saving." />);
    expect(invalid.match(/disabled=""/g)).toHaveLength(2); expect(invalid).toContain('role="alert"');
    const ineligible = renderToStaticMarkup(<SelectedMealActions {...props} canPlan={false} />);
    expect(ineligible.match(/disabled=""/g)).toHaveLength(1); expect(ineligible).toContain("You can still log this meal.");
  });
  it("shows prominent personal conflicts and daily uncertainty without a confirmation gate", () => {
    const html = renderToStaticMarkup(<MealEntryWarnings review={{ warnings: [{ code: "avoided-food", message: "Your foods to avoid (soy) may match tofu. This food is not confirmed safe for you." }], dailyWarnings: [{ code: "daily-carbohydrate", date: "2026-10-25", totalCarbs: null, limit: 130, recipeIds: [], message: "Nutrition is incomplete; your carbohydrate preference cannot be assessed reliably." }] }} />);
    expect(html).toContain("bg-danger-100"); expect(html).toContain("cannot be assessed reliably"); expect(html).toContain("Preferences do not prevent planning"); expect(html).not.toContain("checkbox");
  });
});
