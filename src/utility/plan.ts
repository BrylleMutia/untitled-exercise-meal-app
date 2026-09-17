import type {
  EquipmentId,
  Exercise,
  ExperienceLevel,
  PlannedExercise,
  PlannedWorkout,
  UserProfile,
  WorkoutPlan,
} from "@/types/domain";
import { EXERCISES } from "@/constants/exercises";

/**
 * Deterministic plan generation: identical profile inputs always produce the
 * same plan. No randomness and no AI — catalog order is the stable ordering.
 */

const DAY_SPREAD: Record<number, number[]> = {
  1: [1],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

const SETS_REPS: Record<ExperienceLevel, { sets: number; reps: number; hold: number; rest: number }> = {
  beginner: { sets: 2, reps: 8, hold: 20, rest: 90 },
  intermediate: { sets: 3, reps: 10, hold: 30, rest: 75 },
  advanced: { sets: 3, reps: 12, hold: 40, rest: 60 },
};

interface FocusSpec {
  title: string;
  focus: string;
  categories: Exercise["category"][];
}

const FOCUS_ROTATION: Record<number, FocusSpec[]> = {
  2: [
    { title: "Full Body A", focus: "Balanced strength", categories: ["push", "squat", "core"] },
    { title: "Full Body B", focus: "Balanced strength", categories: ["pull", "hinge", "core"] },
  ],
  3: [
    { title: "Push + Core", focus: "Chest, shoulders, triceps", categories: ["push", "core"] },
    { title: "Pull + Legs", focus: "Back and lower body", categories: ["pull", "squat", "hinge"] },
    { title: "Full Body", focus: "Everything, gently", categories: ["push", "pull", "squat", "core"] },
  ],
  4: [
    { title: "Upper A", focus: "Push emphasis", categories: ["push", "core"] },
    { title: "Lower A", focus: "Legs and hinge", categories: ["squat", "hinge", "core"] },
    { title: "Upper B", focus: "Pull emphasis", categories: ["pull", "push", "core"] },
    { title: "Lower B", focus: "Legs and core", categories: ["squat", "hinge", "core"] },
  ],
  5: [
    { title: "Push", focus: "Chest, shoulders, triceps", categories: ["push", "core"] },
    { title: "Pull", focus: "Back and grip", categories: ["pull", "core"] },
    { title: "Legs", focus: "Squat and hinge", categories: ["squat", "hinge"] },
    { title: "Core + Mobility", focus: "Trunk and range of motion", categories: ["core", "mobility"] },
    { title: "Full Body", focus: "A bit of everything", categories: ["push", "pull", "squat", "hinge", "core"] },
  ],
};

function equipmentOk(exercise: Exercise, owned: EquipmentId[]): boolean {
  return exercise.equipment.every((e) => e === "none" || owned.includes(e));
}

/** Easiest available exercise per category, respecting equipment. */
function pick(category: Exercise["category"], owned: EquipmentId[], used: Set<string>): Exercise | null {
  const pool = EXERCISES.filter(
    (e) => e.category === category && equipmentOk(e, owned) && !used.has(e.id),
  ).sort((a, b) => a.difficulty - b.difficulty);
  return pool[0] ?? null;
}

export function generateWorkoutPlan(
  profile: UserProfile,
  targetId: string,
  now: string,
): WorkoutPlan {
  const days = DAY_SPREAD[Math.min(7, Math.max(1, profile.daysPerWeek))];
  const rotation = FOCUS_ROTATION[Math.min(5, days.length)] ?? FOCUS_ROTATION[5];
  const dose = SETS_REPS[profile.experience];
  const exerciseCount = Math.min(5, Math.max(3, Math.floor(profile.sessionMinutes / 9)));
  const owned: EquipmentId[] = ["none", ...profile.equipment];

  const workouts: PlannedWorkout[] = days.map((dayOfWeek, i) => {
    const spec = rotation[i % rotation.length];
    const used = new Set<string>();
    const exercises: PlannedExercise[] = [];

    for (const category of spec.categories) {
      if (exercises.length >= exerciseCount) break;
      const found = pick(category, owned, used);
      if (!found) continue;
      used.add(found.id);
      exercises.push({
        id: `pe-${i}-${found.slug}`,
        exerciseId: found.id,
        sortOrder: exercises.length + 1,
        slotKey: `day:${dayOfWeek}:exercise:${exercises.length + 1}`,
        sets: dose.sets,
        ...(found.measure === "reps" ? { reps: dose.reps } : { holdSeconds: dose.hold }),
        restSeconds: dose.rest,
      });
    }
    // Fill remaining slots with any unused, available exercises (catalog order).
    for (const e of EXERCISES) {
      if (exercises.length >= exerciseCount) break;
      if (used.has(e.id) || e.category === "mobility" || !equipmentOk(e, owned)) continue;
      used.add(e.id);
      exercises.push({
        id: `pe-${i}-${e.slug}`,
        exerciseId: e.id,
        sortOrder: exercises.length + 1,
        slotKey: `day:${dayOfWeek}:exercise:${exercises.length + 1}`,
        sets: dose.sets,
        ...(e.measure === "reps" ? { reps: dose.reps } : { holdSeconds: dose.hold }),
        restSeconds: dose.rest,
      });
    }

    return {
      id: `pw-${i + 1}`,
      dayOfWeek,
      title: spec.title,
      focus: spec.focus,
      warmup: ["Jumping jack — 60s easy pace", "Arm circles — 30s each direction", "World's greatest stretch — 5 per side"],
      cooldown: ["Kneeling hip flexor stretch — 30s per side", "Doorway chest stretch — 30s", "Cat-cow — 8 slow reps"],
      exercises,
      estimatedMinutes: Math.round(6 + exercises.length * dose.sets * 2.4),
    };
  });

  return {
    id: `plan-${now}`,
    version: 1,
    createdAt: new Date().toISOString(),
    targetId,
    workouts,
  };
}
