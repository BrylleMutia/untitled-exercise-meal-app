import { describe, expect, it } from "vitest";
import { participationMilestones } from "./milestones";
import type { DailyStepEntry, CustomWorkoutSession } from "@/types/domain";
const step = (date: string): DailyStepEntry => ({ date, steps: 0, source: "manual", revision: 1, updatedAt: `${date}T12:00:00Z` });
describe("gentle participation milestones", () => {
  it("does not penalize empty or missed days", () => {
    expect(participationMilestones({ sessions: [], customSessions: [], nutritionLogs: [], dailySteps: [] }, "2026-10-01")).toEqual([]);
  });
  it("counts saved participation on distinct dates, including explicit zero steps", () => {
    const milestones = participationMilestones({ sessions: [], customSessions: [], nutritionLogs: [], dailySteps: [step("2026-09-29"), step("2026-09-30"), step("2026-10-01"), step("2026-10-01"), step("2026-09-01")] }, "2026-10-01");
    expect(milestones).toEqual(["First step entry saved", "You checked in on 3 days this week"]);
  });
  it("includes saved custom workouts without treating unfinished sessions as firsts", () => {
    const session: CustomWorkoutSession = { id: "session-1", workoutId: "routine-1", workoutVersion: 1, date: "2026-10-01", planned: { name: "Familiar mobility", movements: [] }, actual: [], status: "in_progress", revision: 1, startedAt: "2026-10-01T12:00:00Z" };
    const snapshot = { sessions: [], customSessions: [session], nutritionLogs: [], dailySteps: [] };
    expect(participationMilestones(snapshot, "2026-10-01")).toEqual([]);
    session.status = "completed";
    expect(participationMilestones(snapshot, "2026-10-01")).toEqual(["First workout saved"]);
  });
});
