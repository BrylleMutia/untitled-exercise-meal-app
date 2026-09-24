import { describe, expect, it } from "vitest";
import { totalsForDate } from "./nutrition";
import type { NutritionLog } from "@/types/domain";

function log(overrides: Partial<NutritionLog>): NutritionLog {
  return {
    id: "log-1",
    date: "2026-09-22",
    slot: "lunch",
    servings: 1,
    calories: 100,
    proteinG: 10,
    carbsG: 20,
    fatG: 3,
    estimated: false,
    confidence: "high",
    source: "USDA FoodData Central",
    sourceVersion: "release-2026",
    valueSource: "trusted_catalog",
    createdAt: "2026-09-22T12:00:00.000Z",
    ...overrides,
  };
}

describe("nutrition totals", () => {
  it("sums fixed values and AI ranges independently", () => {
    const totals = totalsForDate([
      log({ id: "catalog", calories: 200, proteinG: 15, carbsG: 30, fatG: 5 }),
      log({
        id: "estimate",
        calories: 450,
        proteinG: 12,
        carbsG: 60,
        fatG: 15,
        valueSource: "ai_estimate",
        estimated: true,
        confidence: "low",
        estimateRange: {
          calories: { low: 300, base: 450, high: 650 },
          proteinG: { low: 8, base: 12, high: 20 },
          carbsG: { low: 40, base: 60, high: 85 },
          fatG: { low: 8, base: 15, high: 25 },
        },
      }),
    ], "2026-09-22");

    expect(totals).toMatchObject({ calories: 650, proteinG: 27, carbsG: 90, fatG: 20 });
    expect(totals.estimateRange).toEqual({
      calories: { low: 500, base: 650, high: 850 },
      proteinG: { low: 23, base: 27, high: 35 },
      carbsG: { low: 70, base: 90, high: 115 },
      fatG: { low: 13, base: 20, high: 30 },
    });
  });

  it("does not expose a range when all values are fixed", () => {
    const totals = totalsForDate([log({ calories: 250 })], "2026-09-22");
    expect(totals.estimateRange).toBeUndefined();
  });
});
