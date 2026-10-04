import { describe, expect, it } from "vitest";
import { generateWorkoutPlan } from "./plan";
import { EXERCISES } from "@/constants/exercises";
import type { UserProfile } from "@/types/domain";

export const testProfile: UserProfile = {
  id: "test", name: "Test", age: 30, sex: "female", heightCm: 168, weightKg: 68,
  units: "metric", experience: "beginner", equipment: ["none"], daysPerWeek: 3,
  sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [],
  notificationsEnabled: false, createdAt: "2026-10-01T00:00:00.000Z",
};

describe("Pilates foundations", () => {
  it.each([1, 2, 3, 4, 5, 6, 7])("respects %i days, available time, equipment, and deterministic prescriptions", (daysPerWeek) => {
    for (const experience of ["beginner", "intermediate", "advanced"] as const) {
      for (const sessionMinutes of [15, 20, 30, 120]) {
        const profile = { ...testProfile, trainingProgram: "pilates" as const, daysPerWeek, sessionMinutes, experience };
        const plan = generateWorkoutPlan(profile, "target", "2026-10-01");
        expect(generateWorkoutPlan(profile, "target", "2026-10-01")).toEqual(plan);
        expect(plan.trainingProgram).toBe("pilates");
        expect(plan.workouts).toHaveLength(daysPerWeek);
        expect(new Set(plan.workouts.map((workout) => workout.dayOfWeek)).size).toBe(daysPerWeek);
        for (const workout of plan.workouts) {
          expect(workout.estimatedMinutes).toBeLessThanOrEqual(sessionMinutes);
          expect(workout.warmup.length).toBeGreaterThan(0);
          expect(workout.cooldown.join(" ")).toMatch(/stop for pain/i);
          expect(workout.exercises.length).toBeGreaterThan(0);
          for (const movement of workout.exercises) {
            const exercise = EXERCISES.find((candidate) => candidate.id === movement.exerciseId)!;
            expect(exercise.equipment).toEqual(["none"]);
            expect(workout.focus).toMatch(/Regress/);
            expect(exercise.difficulty).toBeLessThanOrEqual(experience === "beginner" ? 2 : experience === "intermediate" ? 4 : 5);
            expect(exercise.safety).toBeTruthy();
            expect(movement.restSeconds).toBe(45);
          }
        }
      }
    }
  });
  it("uses a gentler dose on consecutive days", () => {
    const plan = generateWorkoutPlan({ ...testProfile, trainingProgram: "pilates", daysPerWeek: 7 }, "target", "2026-10-01");
    expect(plan.workouts.slice(1).every((workout) => workout.exercises.every((exercise) => exercise.sets === 1))).toBe(true);
  });
});
