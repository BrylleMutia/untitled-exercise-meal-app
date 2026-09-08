import type { AppSnapshot } from "@/types/domain";
import type { SnapshotRepository } from "./repository";
import { z } from "zod";

const KEY = "cnc.demo.snapshot.v1";
export let invalidSnapshotDetected = false;

const exerciseLogSchema = z.object({
  exerciseId: z.string(),
  planned: z.object({ sets: z.number(), reps: z.number().optional(), holdSeconds: z.number().optional() }),
  actual: z.object({ sets: z.number(), reps: z.number().optional(), holdSeconds: z.number().optional() }),
  status: z.enum(["completed", "skipped", "modified"]),
  rpe: z.number().optional(),
  manageable: z.boolean().optional(),
  pain: z.boolean().optional(),
  note: z.string().optional(),
});

const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  userId: z.string(),
  onboarded: z.boolean(),
  profile: z
    .object({
      id: z.string(),
      name: z.string(),
      age: z.number(),
      sex: z.enum(["female", "male"]),
      heightCm: z.number(),
      weightKg: z.number(),
      units: z.enum(["metric", "imperial"]),
      experience: z.enum(["beginner", "intermediate", "advanced"]),
      equipment: z.array(z.string()),
      daysPerWeek: z.number(),
      sessionMinutes: z.number(),
      goal: z.enum(["lose", "maintain", "gain", "strength", "consistency"]),
      dietaryPattern: z.string(),
      allergies: z.array(z.string()),
      createdAt: z.string(),
    })
    .nullable(),
  target: z
    .object({
      id: z.string(),
      version: z.number(),
      effectiveDate: z.string(),
      calories: z.number(),
      proteinG: z.number(),
      carbsG: z.number(),
      fatG: z.number(),
      bmr: z.number(),
      bmi: z.number(),
      tdee: z.number(),
      formula: z.string(),
      activityFactor: z.number(),
      disclaimer: z.string(),
    })
    .nullable(),
  plan: z
    .object({
      id: z.string(),
      version: z.number(),
      createdAt: z.string(),
      targetId: z.string(),
      workouts: z.array(
        z.object({
          id: z.string(),
          dayOfWeek: z.number(),
          title: z.string(),
          focus: z.string(),
          warmup: z.array(z.string()),
          cooldown: z.array(z.string()),
          exercises: z.array(
            z.object({
              id: z.string(),
              exerciseId: z.string(),
              sets: z.number(),
              reps: z.number().optional(),
              holdSeconds: z.number().optional(),
              restSeconds: z.number(),
            }),
          ),
          estimatedMinutes: z.number(),
        }),
      ),
    })
    .nullable(),
  mealPlan: z
    .object({
      id: z.string(),
      version: z.number(),
      weekOf: z.string(),
      targetId: z.string(),
      meals: z.array(
        z.object({
          id: z.string(),
          date: z.string(),
          slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
          mealId: z.string().optional(),
          foodId: z.string().optional(),
          label: z.string(),
          servings: z.number(),
          skipped: z.boolean().optional(),
        }),
      ),
    })
    .nullable(),
  sessions: z.array(
    z.object({
      id: z.string(),
      plannedWorkoutId: z.string(),
      plannedPlanVersion: z.number().optional(),
      date: z.string(),
      startedAt: z.string(),
      finishedAt: z.string().optional(),
      status: z.enum(["in_progress", "completed", "partial", "abandoned"]),
      logs: z.array(exerciseLogSchema),
    }),
  ),
  nutritionLogs: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
      foodId: z.string().optional(),
      customName: z.string().optional(),
      servings: z.number(),
      calories: z.number(),
      proteinG: z.number(),
      carbsG: z.number(),
      fatG: z.number(),
      estimated: z.boolean(),
      confidence: z.enum(["high", "medium", "low"]),
      source: z.string(),
      assumptions: z.string().optional(),
      createdAt: z.string(),
    }),
  ),
  weights: z.array(z.object({ id: z.string(), date: z.string(), weightKg: z.number() })),
  grocery: z
    .object({
      id: z.string(),
      weekOf: z.string(),
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          category: z.string(),
          unit: z.string(),
          generatedQuantity: z.number(),
          quantity: z.number(),
          checked: z.boolean(),
          custom: z.boolean().optional(),
          removed: z.boolean().optional(),
        }),
      ),
    })
    .nullable(),
  savedMeals: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      servings: z.number(),
      notes: z.string().optional(),
      ingredients: z.array(z.object({ foodId: z.string(), servings: z.number() })),
    }),
  ),
});

/** Demo-mode persistence. Corruption or version drift fails safe to null. */
export const mockRepository: SnapshotRepository = {
  load() {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) {
        invalidSnapshotDetected = false;
        return null;
      }
      const result = snapshotSchema.safeParse(JSON.parse(raw));
      invalidSnapshotDetected = !result.success;
      return result.success ? (result.data as AppSnapshot) : null;
    } catch {
      invalidSnapshotDetected = true;
      return null;
    }
  },
  save(snapshot) {
    if (typeof window === "undefined") return false;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(snapshot));
      return true;
    } catch {
      // Storage full or unavailable: keep the in-memory state; the UI still
      // works for the session and nothing is presented as server-persisted.
      return false;
    }
  },
  clear() {
    if (typeof window === "undefined") return false;
    try {
      window.localStorage.removeItem(KEY);
      return true;
    } catch {
      return false;
    }
  },
};
