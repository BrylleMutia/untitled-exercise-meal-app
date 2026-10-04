import { describe, expect, it } from "vitest";
import { estimateWalkingEnergy } from "./walkingEnergy";

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
