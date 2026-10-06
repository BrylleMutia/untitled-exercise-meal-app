import type { WeightEntry } from "@/types/domain";

export function summarizeWeightEntries(entries: readonly WeightEntry[]) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0] ?? null;
  const latest = sorted[sorted.length - 1] ?? null;

  return {
    count: sorted.length,
    first,
    latest,
    chartEntries: sorted.slice(-16),
    changeKg: sorted.length >= 2 && first && latest
      ? latest.weightKg - first.weightKg
      : null,
  };
}
