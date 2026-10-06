import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppSnapshot, WeightEntry } from "@/types/domain";
import ProgressPage from "./page";

let snapshot: AppSnapshot;
vi.mock("@/contexts/AppContext", () => ({
  useApp: () => ({ snapshot, actions: { loadHistory: vi.fn() }, error: null }),
  useAppOptional: () => null,
}));

function entry(date: string, weightKg: number): WeightEntry {
  return { id: date, date, weightKg };
}

beforeEach(() => {
  snapshot = {
    schemaVersion: 1, userId: "progress-test", onboarded: true, profile: null,
    foods: [], goal: null, target: null, nutritionWeekTargets: [], plan: null,
    workoutOverrides: [], mealPlan: null, sessions: [], nutritionLogs: [], loggedMeals: [],
    weights: [], grocery: null, savedMeals: [], progressionDecisions: [], dailySteps: [],
    customWorkouts: [], customSessions: [],
  };
});

describe("Progress weight summary", () => {
  it("shows an explicit empty state without drawing a chart", () => {
    const html = renderToStaticMarkup(<ProgressPage />);
    expect(html).toContain("No weight entries yet. Log weight in Settings to see a trend.");
    expect(html).not.toContain('aria-label="Weight trend from');
  });

  it("shows one dated observation without claiming a zero change", () => {
    snapshot.weights = [entry("2026-10-06", 83)];
    const html = renderToStaticMarkup(<ProgressPage />);
    expect(html).toContain("1 entry on 2026-10-06 · no trend yet");
    expect(html).toContain("One weight entry: 83.0 kg on 2026-10-06.");
    expect(html).not.toContain("0.0 kg since");
    expect(html).not.toContain('aria-label="Weight trend from');
  });

  it("draws a dated chart and change once a second observation exists", () => {
    snapshot.weights = [entry("2026-10-06", 83), entry("2026-10-01", 82)];
    const html = renderToStaticMarkup(<ProgressPage />);
    expect(html).toContain("+1.0 kg since 2026-10-01 · 2 entries");
    expect(html).toContain('aria-label="Weight trend from 2026-10-01 to 2026-10-06, 2 entries"');
    expect(html).toContain("2 entries from 2026-10-01 to 2026-10-06; latest 83.0 kg.");
  });
});
