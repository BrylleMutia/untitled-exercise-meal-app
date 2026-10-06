import { describe, expect, it } from "vitest";
import { estimateWalkingEnergy, supportsWalkingEnergyEstimate } from "./walkingEnergy";

describe("walking energy estimate", () => {
  it("requires minutes and returns a broad rounded range", () => {
    expect(estimateWalkingEnergy(70)).toBeNull();
    expect(estimateWalkingEnergy(70, 30)).toMatchObject({ lowKcal: 90, highKcal: 140 });
    expect(estimateWalkingEnergy(60, 1)).toMatchObject({ lowKcal: 0, highKcal: 10 });
  });

  it("rejects missing and impossible inputs", () => {
    expect(estimateWalkingEnergy(0, 30)).toBeNull();
    expect(estimateWalkingEnergy(70, -1)).toBeNull();
    expect(estimateWalkingEnergy(70, 1441)).toBeNull();
    expect(estimateWalkingEnergy(Number.NaN, 30)).toBeNull();
  });
});

describe("walking energy profile eligibility", () => {
  const profile = { age: 30, weightKg: 70, targetEligibility: "eligible" as const };

  it.each([[18, false], [19, true], [59, true], [60, false]])(
    "limits the adult reference at age %i", (age, supported) => {
      expect(supportsWalkingEnergyEstimate({ ...profile, age })).toBe(supported);
    },
  );

  it("requires an eligible profile with valid weight", () => {
    expect(supportsWalkingEnergyEstimate(null)).toBe(false);
    expect(supportsWalkingEnergyEstimate(undefined)).toBe(false);
    expect(supportsWalkingEnergyEstimate({ ...profile, targetEligibility: "unsupported" })).toBe(false);
    expect(supportsWalkingEnergyEstimate({ ...profile, targetEligibility: "not_answered" })).toBe(false);
    expect(supportsWalkingEnergyEstimate({ ...profile, targetEligibility: undefined })).toBe(false);
    for (const weightKg of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(supportsWalkingEnergyEstimate({ ...profile, weightKg })).toBe(false);
    }
  });
});
