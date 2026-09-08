import type { ExerciseLog, WorkoutSession } from "@/types/domain";

export type ProgressionAction = "progress" | "hold" | "regress";

export interface ProgressionSuggestion {
  action: ProgressionAction;
  reason: string;
}

const MAX_SETS = 5;
const MAX_REPS = 20;
const MAX_HOLD = 90;

/** A log qualifies for progression only when work was completed safely and felt easy enough. */
function qualifies(log: ExerciseLog): boolean {
  if (log.status !== "completed" || log.pain) return false;
  if (log.rpe !== undefined) return log.rpe <= 7;
  return log.manageable === true;
}

/** Most-recent-first logs for one exercise across completed sessions. */
function logsFor(exerciseId: string, sessions: WorkoutSession[]): ExerciseLog[] {
  return sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((s) => s.logs)
    .filter((l) => l.exerciseId === exerciseId);
}

/**
 * Deterministic RPE rules from FEATURES.md:
 * two qualifying exposures -> one small step up; RPE 9-10 or pain -> regress;
 * RPE 8 / partial / skipped -> hold; two non-qualifying -> suggest regression.
 */
export function suggestProgression(
  exerciseId: string,
  sessions: WorkoutSession[],
): ProgressionSuggestion | null {
  const recent = logsFor(exerciseId, sessions).slice(0, 2);
  if (recent.length === 0) return null;

  const newest = recent[0];
  if (newest.pain || (newest.rpe !== undefined && newest.rpe >= 9)) {
    return {
      action: "regress",
      reason: "High effort or discomfort reported — repeat the easier variation next time.",
    };
  }

  if (recent.length === 2 && recent.every(qualifies)) {
    const planned = newest.planned;
    const step =
      planned.reps !== undefined && planned.reps + 2 <= MAX_REPS
        ? `+2 reps (up to ${MAX_REPS})`
        : planned.holdSeconds !== undefined && planned.holdSeconds + 5 <= MAX_HOLD
          ? `+5s holds (up to ${MAX_HOLD}s)`
          : planned.sets < MAX_SETS
            ? "+1 set"
            : "a harder variation";
    return {
      action: "progress",
      reason: `Two manageable sessions in a row — suggested step: ${step}. You can override this.`,
    };
  }

  if (recent.length === 2 && recent.every((l) => !qualifies(l))) {
    return {
      action: "regress",
      reason: "Two tough exposures — consider the easier variation before adding work.",
    };
  }

  return { action: "hold", reason: "Keep the current level until two easy sessions stack up." };
}
