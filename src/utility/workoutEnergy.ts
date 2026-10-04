import type { WorkoutSession } from "@/types/domain";

// 2024 Adult Compendium: calisthenics at moderate effort (standard MET).
const MODERATE_CALISTHENICS_MET = 3.8;

interface EstimateWorkoutEnergyInput {
  sessions: WorkoutSession[];
  fromDate: string;
  toDate: string;
  weightKg: number;
  plannedWorkoutMinutes: Readonly<Record<string, number>>;
  fallbackWorkoutMinutes: number;
}

/**
 * Rough weekly energy estimate from completed session elapsed time and current
 * profile weight. The MET model is a population-level estimate, not a personal
 * measurement; elapsed time is capped to the planned or typical session length.
 */
export function estimateWorkoutEnergyKcal({
  sessions,
  fromDate,
  toDate,
  weightKg,
  plannedWorkoutMinutes,
  fallbackWorkoutMinutes,
}: EstimateWorkoutEnergyInput): number | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (!Number.isFinite(fallbackWorkoutMinutes) || fallbackWorkoutMinutes <= 0) return null;

  let estimatedKcal = 0;
  let estimatedSessionCount = 0;

  for (const session of sessions) {
    if (
      session.status !== "completed" ||
      session.trainingProgram === "pilates" ||
      session.date < fromDate ||
      session.date > toDate ||
      !session.finishedAt
    ) {
      continue;
    }

    const startedAtMs = Date.parse(session.startedAt);
    const finishedAtMs = Date.parse(session.finishedAt);
    const elapsedMinutes = (finishedAtMs - startedAtMs) / 60_000;
    const durationCap = plannedWorkoutMinutes[session.plannedWorkoutId] ?? fallbackWorkoutMinutes;

    if (
      !Number.isFinite(elapsedMinutes) ||
      elapsedMinutes < 1 ||
      !Number.isFinite(durationCap) ||
      durationCap <= 0
    ) {
      continue;
    }

    const cappedMinutes = Math.min(elapsedMinutes, durationCap);
    // The Compendium defines 1 standard MET as approximately 1 kcal/kg/hour.
    estimatedKcal += MODERATE_CALISTHENICS_MET * weightKg * (cappedMinutes / 60);
    estimatedSessionCount += 1;
  }

  if (estimatedSessionCount === 0) return null;

  // Avoid implying single-calorie precision for a population-level estimate.
  return Math.max(10, Math.round(estimatedKcal / 10) * 10);
}
