import { EXERCISES } from "@/constants/exercises";
import type { CustomWorkoutDefinition, UserProfile } from "@/types/domain";

export function customWorkoutMinutes(definition: CustomWorkoutDefinition): number {
  return Math.ceil(8 + definition.movements.reduce((total, movement) => total + movement.sets * ((movement.reps ?? 0) * 4 + (movement.holdSeconds ?? 0) + movement.restSeconds) / 60, 0));
}

export function validateCustomWorkout(definition: CustomWorkoutDefinition, profile: UserProfile): string | null {
  if (!definition.name.trim() || definition.name.length > 100) return "Give your routine a name (up to 100 characters).";
  if (definition.movements.length < 1 || definition.movements.length > 24) return "Choose 1 to 24 movements.";
  const ids = new Set<string>();
  for (const movement of definition.movements) {
    if (!movement.id || movement.id.length > 128 || ids.has(movement.id)) return "Each movement needs a unique identity.";
    ids.add(movement.id);
    if (!movement.name.trim() || movement.name.length > 100) return "Name each movement (up to 100 characters).";
    if (!Number.isInteger(movement.sets) || movement.sets < 1 || movement.sets > 6) return "Choose 1 to 6 whole sets.";
    if (!Number.isInteger(movement.restSeconds) || movement.restSeconds < 15 || movement.restSeconds > 180) return "Choose 15 to 180 seconds of rest.";
    if ((movement.reps === undefined) === (movement.holdSeconds === undefined)) return "Choose reps or a hold time for each movement.";
    if (movement.reps !== undefined && (!Number.isInteger(movement.reps) || movement.reps < 1 || movement.reps > 50)) return "Choose 1 to 50 whole reps.";
    if (movement.holdSeconds !== undefined && (!Number.isInteger(movement.holdSeconds) || movement.holdSeconds < 5 || movement.holdSeconds > 120)) return "Choose a hold of 5 to 120 whole seconds.";
    if (movement.exerciseId) {
      const exercise = EXERCISES.find((candidate) => candidate.id === movement.exerciseId);
      if (!exercise) return "Choose an available catalog exercise.";
      if (exercise.equipment.some((item) => item !== "none" && !profile.equipment.includes(item))) return "This exercise needs equipment outside your profile.";
      if (exercise.difficulty > (profile.experience === "beginner" ? 2 : profile.experience === "intermediate" ? 4 : 5)) return "Choose an exercise that fits your experience.";
      if ((exercise.measure === "reps") !== (movement.reps !== undefined)) return "Use the catalog exercise's reps or hold measure.";
    }
  }
  return customWorkoutMinutes(definition) > profile.sessionMinutes ? `This routine needs about ${customWorkoutMinutes(definition)} minutes, including warm-up and cooldown. Your profile allows ${profile.sessionMinutes}. Reduce the work or update your available time.` : null;
}
