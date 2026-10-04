import { describe, expect, it } from "vitest";
import { validateCustomWorkout, customWorkoutMinutes } from "./customWorkouts";
import type { CustomWorkoutDefinition, UserProfile } from "@/types/domain";

const profile = { equipment: ["none"], experience: "beginner", sessionMinutes: 30 } as UserProfile;
const definition: CustomWorkoutDefinition = { name: "My mobility", movements: [{ id: "first", name: "Comfortable reach", sets: 2, reps: 6, restSeconds: 45 }] };
describe("custom workout prescriptions", () => {
  it("allows text-only movements without adding progression or catalog identities", () => {
    const before = structuredClone(definition);
    expect(validateCustomWorkout(definition, profile)).toBeNull();
    expect(customWorkoutMinutes(definition)).toBe(11);
    expect(definition).toEqual(before);
  });
  it("rejects duplicate identities, invalid quantities and excessive duration", () => {
    expect(validateCustomWorkout({ ...definition, movements: [...definition.movements, definition.movements[0]] }, profile)).toMatch(/unique/);
    expect(validateCustomWorkout({ ...definition, movements: [{ ...definition.movements[0], sets: 1.5 }] }, profile)).toMatch(/whole sets/);
    expect(validateCustomWorkout({ ...definition, movements: [{ ...definition.movements[0], sets: 6, reps: 50, restSeconds: 180 }] }, profile)).toMatch(/available time/);
  });
  it("requires catalog equipment and the catalog measure", () => {
    expect(validateCustomWorkout({ ...definition, movements: [{ ...definition.movements[0], exerciseId: "ex-pull-up" }] }, profile)).not.toBeNull();
    expect(validateCustomWorkout({ ...definition, movements: [{ ...definition.movements[0], exerciseId: "ex-plank" }] }, profile)).toMatch(/measure/);
  });
});
