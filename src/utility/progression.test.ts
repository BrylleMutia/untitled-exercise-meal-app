import { describe, expect, it } from "vitest";
import { suggestProgression } from "./progression";
import type { ExerciseLog, WorkoutSession } from "@/types/domain";

function session(date: string, logs: ExerciseLog[]): WorkoutSession {
  return {
    id: `s-${date}`,
    plannedWorkoutId: "pw-1",
    date,
    startedAt: `${date}T08:00:00.000Z`,
    finishedAt: `${date}T08:45:00.000Z`,
    status: "completed",
    logs,
  };
}

function log(rpe?: number, extra?: Partial<ExerciseLog>): ExerciseLog {
  return {
    exerciseId: "ex-push-up",
    planned: { sets: 3, reps: 10 },
    actual: { sets: 3, reps: 10 },
    status: "completed",
    rpe,
    ...extra,
  };
}

describe("progression rules", () => {
  it("suggests progress after two qualifying sessions", () => {
    const s = suggestProgression("ex-push-up", [
      session("2026-09-05", [log(6)]),
      session("2026-09-03", [log(7)]),
    ]);
    expect(s?.action).toBe("progress");
  });

  it("accepts an explicit manageable mark when RPE is missing", () => {
    const s = suggestProgression("ex-push-up", [
      session("2026-09-05", [log(undefined, { manageable: true })]),
      session("2026-09-03", [log(7)]),
    ]);
    expect(s?.action).toBe("progress");
  });

  it("regresses on RPE 9-10 or reported pain", () => {
    expect(
      suggestProgression("ex-push-up", [session("2026-09-05", [log(9)])])?.action,
    ).toBe("regress");
    expect(
      suggestProgression("ex-push-up", [
        session("2026-09-05", [log(5, { pain: true })]),
      ])?.action,
    ).toBe("regress");
  });

  it("holds after a single RPE 8 session", () => {
    const s = suggestProgression("ex-push-up", [session("2026-09-05", [log(8)])]);
    expect(s?.action).toBe("hold");
  });

  it("suggests regression after two non-qualifying sessions", () => {
    const s = suggestProgression("ex-push-up", [
      session("2026-09-05", [log(8)]),
      session("2026-09-03", [log(undefined)]),
    ]);
    expect(s?.action).toBe("regress");
  });

  it("returns null with no history", () => {
    expect(suggestProgression("ex-push-up", [])).toBeNull();
  });
});
