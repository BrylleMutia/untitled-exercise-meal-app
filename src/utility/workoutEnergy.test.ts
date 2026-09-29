import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "@/types/domain";
import { estimateWorkoutEnergyKcal } from "./workoutEnergy";

function session(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "session-1",
    plannedWorkoutId: "workout-1",
    date: "2026-09-29",
    startedAt: "2026-09-29T08:00:00.000Z",
    finishedAt: "2026-09-29T08:30:00.000Z",
    status: "completed",
    logs: [],
    ...overrides,
  };
}

const defaultInput = {
  sessions: [session()],
  fromDate: "2026-09-28",
  toDate: "2026-09-29",
  weightKg: 70,
  plannedWorkoutMinutes: { "workout-1": 45 },
  fallbackWorkoutMinutes: 30,
};

describe("workout energy estimate", () => {
  it("estimates completed session energy and rounds to 10 kcal", () => {
    expect(estimateWorkoutEnergyKcal(defaultInput)).toBe(130);
  });

  it("caps elapsed time at the planned workout duration", () => {
    expect(
      estimateWorkoutEnergyKcal({
        ...defaultInput,
        sessions: [session({ finishedAt: "2026-09-29T09:30:00.000Z" })],
        plannedWorkoutMinutes: { "workout-1": 30 },
      }),
    ).toBe(130);
  });

  it("adds estimates for multiple completed sessions in the selected week", () => {
    expect(
      estimateWorkoutEnergyKcal({
        ...defaultInput,
        sessions: [
          session(),
          session({
            id: "session-2",
            plannedWorkoutId: "workout-2",
            startedAt: "2026-09-29T09:00:00.000Z",
            finishedAt: "2026-09-29T09:30:00.000Z",
            date: "2026-09-29",
          }),
        ],
      }),
    ).toBe(270);
  });

  it("excludes uncompleted sessions and dates outside the selected week", () => {
    expect(
      estimateWorkoutEnergyKcal({
        ...defaultInput,
        sessions: [
          session({ status: "partial" }),
          session({ id: "old", date: "2026-09-20" }),
          session({ id: "future", date: "2026-10-01" }),
        ],
      }),
    ).toBeNull();
  });

  it("returns no estimate for missing or invalid inputs", () => {
    expect(estimateWorkoutEnergyKcal({ ...defaultInput, sessions: [] })).toBeNull();
    expect(estimateWorkoutEnergyKcal({ ...defaultInput, weightKg: 0 })).toBeNull();
    expect(
      estimateWorkoutEnergyKcal({
        ...defaultInput,
        sessions: [session({ finishedAt: undefined })],
      }),
    ).toBeNull();
  });
});
