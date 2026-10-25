import { describe, expect, it } from "vitest";
import type { AppSnapshot, WorkoutSession } from "@/types/domain";
import { formatWalkingTime, homeStepSummary, homeWorkoutSummary } from "./homeActivity";

const date = "2026-10-05";
function snapshot(): AppSnapshot {
  return { profile: { age: 30, weightKg: 68, sessionMinutes: 30, targetEligibility: "eligible", weekStartsOn: 1 }, sessions: [], dailySteps: [],
    plan: { workouts: [{ id: "workout", dayOfWeek: 1, title: "Strength", focus: "Core", estimatedMinutes: 30, exercises: [] }] } } as unknown as AppSnapshot;
}
const session = (extra: Partial<WorkoutSession> = {}): WorkoutSession => ({ id: "session", plannedWorkoutId: "workout", date, startedAt: `${date}T08:00:00Z`, finishedAt: `${date}T08:30:00Z`, status: "completed", logs: [], ...extra });
describe("Home workout derivation", () => {
  it("preserves week bounds and deduplicated completion counts", () => {
    const data = snapshot(); data.sessions = [session(), session({ id: "retry" }), session({ date: "2026-10-04" }), session({ date: "2026-10-06" }), session({ status: "partial" })];
    expect(homeWorkoutSummary(data, date)).toMatchObject({ completed: 1, scheduled: 1, progress: 1, action: "View workouts", href: "/workouts" });
  });
  it("starts unstarted workouts, resumes active sessions and never auto-starts a completed workout", () => {
    const data = snapshot();
    expect(homeWorkoutSummary(data, date)).toMatchObject({ action: "Start workout", href: "/workouts/session/workout" });
    data.sessions = [session({ status: "in_progress", finishedAt: undefined })];
    expect(homeWorkoutSummary(data, date).action).toBe("Resume workout");
    data.sessions = [session()]; expect(homeWorkoutSummary(data, date).href).toBe("/workouts");
  });
  it("keeps no-plan and rest-day navigation without fictitious progress", () => {
    const data = snapshot(); data.plan = null;
    expect(homeWorkoutSummary(data, date)).toMatchObject({ progress: null, action: "View workouts", href: "/workouts" });
    data.plan = snapshot().plan;
    expect(homeWorkoutSummary(data, "2026-10-06").workout).toBeUndefined();
  });
  it("keeps program/profile energy restrictions", () => {
    const data = snapshot(); data.plan!.trainingProgram = "pilates";
    expect(homeWorkoutSummary(data, date).energyStatus).toContain("this program");
    data.profile!.targetEligibility = "unsupported";
    expect(homeWorkoutSummary(data, date)).toMatchObject({ energy: null, suggestion: null });
  });
});
describe("Home step derivation", () => {
  it("updates every selected-day fact without moving the real current week or exposing future observations", () => {
    const data = snapshot(); data.profile!.dailyStepTarget = 8000;
    const today = "2027-01-01";
    data.dailySteps = Array.from({ length: 7 }, (_, index) => ({ date: ["2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02","2027-01-03"][index], steps: index * 1000, walkingMinutes: index * 10, revision: 1, source: "manual" as const, updatedAt: today }));
    const before = JSON.stringify(data);
    for (const [index, day] of homeStepSummary(data, today).days.entries()) {
      const summary = homeStepSummary(data, today, day.date);
      expect(summary.days.map(item => item.date)).toEqual(data.dailySteps.map(item => item.date));
      expect(summary.upcoming).toBe(day.date > today);
      if (day.date > today) expect(summary).toMatchObject({ entry: undefined, progress: null, energy: null, energyLabel: "Upcoming" });
      else {
        expect(summary.entry).toEqual(data.dailySteps[index]);
        expect(summary.progress).toBe(index * 1000 / 8000);
        expect(Boolean(summary.energy)).toBe(index > 0);
      }
    }
    expect(JSON.stringify(data)).toBe(before);
    data.profile!.weekStartsOn = 6;
    expect(homeStepSummary(data, today, "2026-12-31").days[0].date).toBe("2026-12-26");
  });
  it("keeps missing selected days unknown while using the current target and profile", () => {
    const data = snapshot(); data.profile!.dailyStepTarget = 10000;
    expect(homeStepSummary(data, "2026-10-07", date)).toMatchObject({ entry: undefined, progress: null, energy: null, target: 10000, upcoming: false });
    data.dailySteps = [{ date, steps: 0, revision: 1, source: "manual", updatedAt: date }];
    expect(homeStepSummary(data, "2026-10-07", date)).toMatchObject({ progress: 0, energyLabel: "Add walking minutes for an estimate" });
    data.dailySteps[0] = { ...data.dailySteps[0], steps: 12000, walkingMinutes: 35 };
    expect(homeStepSummary(data, "2026-10-07", date).progress).toBe(1.2);
    data.profile!.age = 60;
    expect(homeStepSummary(data, "2026-10-07", date).energyLabel).toBe("Energy unavailable for this profile");
  });
  it("uses the account week start, including month/year boundaries", () => {
    const data = snapshot();
    expect(homeStepSummary(data, "2027-01-01").days.map(day => day.date)).toEqual(["2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02","2027-01-03"]);
    data.profile!.weekStartsOn = 0;
    expect(homeStepSummary(data, "2027-01-01").days[0].date).toBe("2026-12-27");
  });
  it("keeps saved zero separate from missing observations and marks future rows", () => {
    const data = snapshot(); data.profile!.dailyStepTarget = 8000;
    expect(homeStepSummary(data, date).progress).toBeNull();
    data.dailySteps = [{ date, steps: 0, walkingMinutes: 0, revision: 1, source: "manual", updatedAt: `${date}T08:00:00Z` }];
    expect(homeStepSummary(data, date)).toMatchObject({ progress: 0, energy: null });
    expect(homeStepSummary(data, date).days.filter(day => day.upcoming)).toHaveLength(6);
    data.dailySteps[0].steps = 12000; expect(homeStepSummary(data, date).progress).toBe(1.5);
  });
  it.each([[undefined,"Add walking minutes"],[0,"Energy unavailable for 0"]])("keeps missing and zero minutes distinct (%s)", (minutes, message) => {
    const data = snapshot(); data.dailySteps = [{ date, steps: 100, walkingMinutes: minutes as number | undefined, revision: 1, source: "manual", updatedAt: date }];
    expect(homeStepSummary(data, date).energyLabel).toContain(message);
  });
  it.each([[0,"0 mins"],[1,"1 min"],[35,"35 mins"],[60,"1 hr"],[90,"1 hr 30 mins"]])("formats %i walking minutes", (minutes, label) => expect(formatWalkingTime(Number(minutes))).toBe(label));
});
