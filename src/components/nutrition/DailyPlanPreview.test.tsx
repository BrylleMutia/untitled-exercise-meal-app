import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DailyPlanPreview } from "./DailyPlanPreview";
import type { ResultingPlannedMeal } from "@/types/planningPreview";

const meal: ResultingPlannedMeal = { id: "saved", memberId: "me", mealId: "recipe", date: "2026-10-14", slot: "lunch", label: "Saved portion", servings: 1.25, status: "kept", expectedCalories: 321 };
const props = { weekOf: "2026-10-11", dates: [meal.date], userId: "me", current: true, disabled: false };

describe("resulting planned day presentation", () => {
  it("renders retained and new portions, explicit empty slots and unknown nutrients", () => {
    const html = renderToStaticMarkup(<DailyPlanPreview {...props} meals={[meal, { ...meal, id: "new", label: "New portion", status: "new" }]} />);
    expect(html).toContain("Kept");
    expect(html).toContain("New portion");
    expect(html).toContain("321 kcal");
    expect(html).not.toContain("401");
    expect(html.match(/Estimated servings/g)).toHaveLength(2);
    expect(html.match(/No planned meal/g)).toHaveLength(3);
    expect(html).toContain("unavailable");
    expect(html).not.toContain('type="number"');
  });
  it("defaults to the selected current member and excludes other people and dates", () => {
    const html = renderToStaticMarkup(<DailyPlanPreview {...props} people={[{ id: "other", name: "Other" }, { id: "me", name: "Me" }]} meals={[meal, { ...meal, id: "private", memberId: "other", label: "Other meal" }, { ...meal, id: "later", date: "2026-10-15", label: "Later meal" }]} />);
    expect(html).toContain('value="me" selected=""');
    expect(html).toContain("Saved portion");
    expect(html).not.toContain("Other meal");
    expect(html).not.toContain("Later meal");
  });
  it("hides stale details and handles no selected days", () => {
    expect(renderToStaticMarkup(<DailyPlanPreview {...props} current={false} meals={[meal]} />)).not.toContain("Saved portion");
    const empty = renderToStaticMarkup(<DailyPlanPreview {...props} dates={[]} meals={[meal]} />);
    expect(empty).not.toContain("Saved portion");
    expect(empty.match(/disabled=""/g)).toHaveLength(7);
  });
  it("places pending feedback after date navigation and hides even previously current meals", () => {
    const html = renderToStaticMarkup(<DailyPlanPreview {...props} loading meals={[meal]} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Generating plan preview…");
    expect(html.indexOf("Generating plan preview…")).toBeGreaterThan(html.indexOf("Choose a day"));
    expect(html).not.toContain("Saved portion");
    expect(html).not.toContain("No planned meal");
  });
});
