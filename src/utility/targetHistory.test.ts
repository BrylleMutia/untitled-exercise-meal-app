import { describe, expect, it } from "vitest";
import { targetForDate, targetsForNutritionWeek } from "./targetHistory";

describe("nutrition target versions by local date", () => {
  const targets = [
    { id: "first", version: 1, effectiveDate: "2026-09-01", calories: 1800 },
    { id: "changed", version: 2, effectiveDate: "2026-10-01", calories: 2100 },
    { id: "future", version: 3, effectiveDate: "2026-10-02", calories: 2300 },
    { id: "same-day-edit", version: 4, effectiveDate: "2026-10-01", calories: 2000 },
  ];
  it("keeps earlier days on their effective version and prefers the latest same-day edit", () => {
    expect(targetForDate(targets, "2026-09-30")?.calories).toBe(1800);
    expect(targetForDate(targets, "2026-10-01")?.calories).toBe(2000);
    expect(targetForDate(targets, "2026-10-02")?.calories).toBe(2300);
    expect(targetForDate(targets, "2026-08-31")).toBeNull();
  });
  it("retains only distinct effective versions needed for the seven-day selector", () => {
    const week = targetsForNutritionWeek(targets, "2026-10-01");
    expect(week.map((target) => target.id)).toEqual(["first", "same-day-edit", "future"]);
    expect(targets[0].id).toBe("first");
    expect(targetsForNutritionWeek([], "2026-10-01")).toEqual([]);
  });
});
