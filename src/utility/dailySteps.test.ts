import { describe, expect, it } from "vitest";
import { validateDailySteps } from "./dailySteps";
import { todayKey } from "./dates";

describe("daily step inputs", () => {
  it("accepts an explicitly recorded zero without inventing minutes", () => {
    expect(validateDailySteps(todayKey(), 0)).toBeNull();
    expect(validateDailySteps(todayKey(), 1000, 20)).toBeNull();
  });
  it("rejects fractional, impossible, and invalid-date observations", () => {
    expect(validateDailySteps(todayKey(), 1.5)).not.toBeNull();
    expect(validateDailySteps(todayKey(), 0, 1441)).not.toBeNull();
    expect(validateDailySteps("2026-02-30", 1000)).not.toBeNull();
    expect(validateDailySteps(todayKey(), Number.NaN)).not.toBeNull();
  });
});
