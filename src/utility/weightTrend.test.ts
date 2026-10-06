import { describe, expect, it } from "vitest";
import type { WeightEntry } from "@/types/domain";
import { summarizeWeightEntries } from "./weightTrend";

function entry(date: string, weightKg: number): WeightEntry {
  return { id: date, date, weightKg };
}

describe("weight trend state", () => {
  it("keeps empty and single-entry histories distinct from a measured change", () => {
    expect(summarizeWeightEntries([])).toMatchObject({ count: 0, latest: null, changeKg: null, chartEntries: [] });
    expect(summarizeWeightEntries([entry("2026-10-06", 83)])).toMatchObject({
      count: 1,
      latest: entry("2026-10-06", 83),
      changeKg: null,
    });
  });

  it("sorts observations and limits the chart window without changing the full-history delta", () => {
    const entries = Array.from({ length: 18 }, (_, index) =>
      entry(`2026-10-${String(index + 1).padStart(2, "0")}`, 83 + index),
    ).reverse();
    const result = summarizeWeightEntries(entries);
    expect(result.count).toBe(18);
    expect(result.first?.date).toBe("2026-10-01");
    expect(result.latest?.date).toBe("2026-10-18");
    expect(result.changeKg).toBe(17);
    expect(result.chartEntries).toHaveLength(16);
    expect(result.chartEntries[0].date).toBe("2026-10-03");
    expect(entries[0].date).toBe("2026-10-18");
  });
});
