import { describe, expect, it } from "vitest";
import {
  activityFactorFor,
  buildDailyTarget,
  calculateBmi,
  calculateBmr,
  calculateTdee,
  calorieTargetForGoal,
  cmToIn,
  inToCm,
  isAggressiveRate,
  kgToLb,
  lbToKg,
  macroTargets,
  validateProfileInput,
} from "./health";

describe("health utilities", () => {
  it("calculates Mifflin-St Jeor BMR for both sexes", () => {
    // 10*76 + 6.25*178 - 5*29 = 1727.5, then +5 / -161
    expect(calculateBmr({ sex: "male", age: 29, weightKg: 76, heightCm: 178 })).toBe(1733);
    expect(calculateBmr({ sex: "female", age: 29, weightKg: 76, heightCm: 178 })).toBe(1567);
  });

  it("calculates BMI with one decimal", () => {
    expect(calculateBmi(76, 178)).toBe(24);
  });

  it("maps training days to the documented activity table", () => {
    expect(activityFactorFor(1)).toBe(1.35);
    expect(activityFactorFor(3)).toBe(1.45);
    expect(activityFactorFor(5)).toBe(1.55);
    expect(activityFactorFor(7)).toBe(1.65);
  });

  it("computes TDEE and goal-adjusted calorie targets", () => {
    const tdee = calculateTdee(1743, 1.45);
    expect(tdee).toBe(2527);
    expect(calorieTargetForGoal(tdee, "lose")).toBeLessThan(tdee);
    expect(calorieTargetForGoal(tdee, "maintain")).toBe(2525);
    expect(calorieTargetForGoal(tdee, "gain")).toBeGreaterThan(tdee);
  });

  it("builds macro targets that sum close to the calorie goal", () => {
    const m = macroTargets(2500, 76, "strength");
    const kcal = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
    expect(Math.abs(kcal - 2500)).toBeLessThanOrEqual(120);
  });

  it("rejects unsupported input instead of clamping it", () => {
    const errors = validateProfileInput({
      age: 16,
      sex: "male",
      heightCm: 178,
      weightKg: 76,
      daysPerWeek: 3,
      sessionMinutes: 45,
    });
    expect(errors.some((e) => e.includes("adults-only"))).toBe(true);
  });

  it("flags aggressive weekly change rates above 1% bodyweight", () => {
    expect(isAggressiveRate(80, 76, 3)).toBe(true);
    expect(isAggressiveRate(80, 79, 3)).toBe(false);
  });

  it("converts units round-trip within tolerance", () => {
    expect(Math.abs(lbToKg(kgToLb(76)) - 76)).toBeLessThan(0.001);
    expect(Math.abs(inToCm(cmToIn(178)) - 178)).toBeLessThan(0.001);
  });

  it("builds a target snapshot with formula and disclaimer retained", () => {
    const target = buildDailyTarget(
      {
        id: "u1",
        name: "Test",
        age: 29,
        sex: "male",
        heightCm: 178,
        weightKg: 76,
        units: "metric",
        experience: "intermediate",
        equipment: ["none"],
        daysPerWeek: 3,
        sessionMinutes: 45,
        goal: "strength",
        dietaryPattern: "none",
        allergies: [],
        createdAt: new Date(0).toISOString(),
      },
      "2026-09-07",
    );
    expect(target.formula).toBe("mifflin-st-jeor");
    expect(target.effectiveDate).toBe("2026-09-07");
    expect(target.disclaimer).toContain("not medical");
  });
});
