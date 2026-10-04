import { describe, expect, it } from "vitest";
import { calorieBudgetState } from "./calorieBudget";

describe("remaining calorie budget", () => {
  it("keeps an unlogged day unknown, while an explicitly logged zero has a budget", () => {
    expect(calorieBudgetState({ target: 2000, logged: 0, status: "unlogged" })).toMatchObject({ remaining: null, summary: "No meals logged; intake is unknown" });
    expect(calorieBudgetState({ target: 2000, logged: 0, status: "partial" })).toMatchObject({ remaining: 2000, fraction: 1 });
  });
  it("reduces the circle as intake rises and labels uncertain intake", () => {
    expect(calorieBudgetState({ target: 2000, logged: 500, status: "partial", estimated: true })).toMatchObject({ remaining: 1500, fraction: 0.75, summary: "Approximately 1500 kcal remaining from the estimated target" });
    expect(calorieBudgetState({ target: 2000, logged: 1500, status: "complete" }).fraction).toBe(0.25);
  });
  it("clamps over-target progress at zero without hiding the excess", () => {
    expect(calorieBudgetState({ target: 2000, logged: 2300, status: "complete" })).toMatchObject({ remaining: 0, fraction: 0, over: true, summary: "About 300 kcal above the estimated target" });
  });
  it.each([null, 0, -1, Number.NaN])("does not invent an unavailable target %s", (target) => {
    expect(calorieBudgetState({ target, logged: 500, status: "partial" })).toMatchObject({ remaining: null, hasTarget: false, summary: "No calorie target set" });
  });
});
