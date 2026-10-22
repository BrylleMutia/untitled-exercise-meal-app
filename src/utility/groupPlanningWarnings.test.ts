import { describe, expect, it } from "vitest";
import { groupPlanningWarnings } from "./groupPlanningWarnings";

const warning = (date: string, slot: string) => `${date} · ${slot}: some members have no eligible assignment within their available portions and planning limits.`;

describe("group planning warning presentation", () => {
  it("groups by chronological date and breakfast/lunch/dinner/snack order", () => {
    expect(groupPlanningWarnings([
      warning("2026-10-22", "lunch"), warning("2026-10-21", "snack"),
      warning("2026-10-21", "dinner"), warning("2026-10-21", "breakfast"), warning("2026-10-21", "lunch"),
    ])).toEqual({ unfilled: [
      { date: "2026-10-21", slots: ["breakfast", "lunch", "dinner", "snack"] },
      { date: "2026-10-22", slots: ["lunch"] },
    ], mealTimes: 5, notes: [] });
  });
  it("counts affected meal times once rather than inferring a member count", () => {
    expect(groupPlanningWarnings([warning("2026-10-21", "lunch"), warning("2026-10-21", "lunch")]).mealTimes).toBe(1);
  });
  it("keeps the zero-assignment explanation as a visible note", () => {
    const message = "No meals fit these people, days, recipes, and available planning limits.";
    expect(groupPlanningWarnings([warning("2026-10-21", "lunch"), message]).notes).toEqual([message]);
  });
  it("preserves unknown, changed, and invalid-date warnings verbatim", () => {
    const notes = ["Review updated recipes.", "2026-10-21 · lunch: a different planning warning.", warning("2026-02-30", "lunch"), warning("2026-10-21", "brunch")];
    expect(groupPlanningWarnings(notes)).toEqual({ unfilled: [], mealTimes: 0, notes });
  });
  it("has no unfilled summary for a complete preview", () => {
    expect(groupPlanningWarnings([])).toEqual({ unfilled: [], mealTimes: 0, notes: [] });
  });
});
