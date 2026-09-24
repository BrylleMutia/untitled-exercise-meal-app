import { exerciseById, exerciseBySlug } from "@/constants/exercises";
import type { Exercise, ExerciseLog, WorkoutSession } from "@/types/domain";

export type ProgressionAction = "progress" | "hold" | "regress";

export interface ProgressionSuggestion {
  action: ProgressionAction;
  reason: string;
  ruleVersion: "mvp1-rpe-v1";
  sourceSessionIds: string[];
  proposedSets?: number;
  proposedReps?: number;
  proposedHoldSeconds?: number;
  replacementExerciseId?: string;
}

export const PROGRESSION_RULE_VERSION = "mvp1-rpe-v1" as const;

const DEFAULT_BOUNDS = {
  minSets: 1,
  maxSets: 5,
  setStep: 1,
  minReps: 1,
  maxReps: 20,
  repStep: 2,
  minHoldSeconds: 5,
  maxHoldSeconds: 90,
  holdStep: 5,
};

export function boundsFor(exercise: Exercise | undefined) {
  return exercise?.progressionBounds ?? DEFAULT_BOUNDS;
}

/** A log qualifies for progression only when work was completed safely and felt easy enough. */
function qualifies(log: ExerciseLog): boolean {
  if (log.status !== "completed" || log.pain) return false;
  if (log.rpe !== undefined) return log.rpe <= 7;
  return log.manageable === true;
}

/** Most-recent-first logs for one exercise across completed sessions. */
function logsFor(exerciseId: string, sessions: WorkoutSession[]) {
  return sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((s) => s.logs
      .filter((l) => l.exerciseId === exerciseId || l.plannedExerciseId === exerciseId)
      .map((log) => ({ log, sessionId: s.id })));
}

function variationId(reference: string | undefined) {
  if (!reference) return undefined;
  return exerciseById(reference)?.id ?? exerciseBySlug(reference)?.id;
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

  const newest = recent[0].log;
  const exercise = exerciseById(exerciseId) ?? exerciseBySlug(exerciseId);
  const bounds = boundsFor(exercise);
  const sourceSessionIds = recent.map((entry) => entry.sessionId);
  if (newest.pain || (newest.rpe !== undefined && newest.rpe >= 9)) {
    return {
      action: "regress",
      reason: "High effort or discomfort reported — repeat the easier variation next time.",
      ruleVersion: PROGRESSION_RULE_VERSION,
      sourceSessionIds,
      ...(variationId(exercise?.regression) ? { replacementExerciseId: variationId(exercise?.regression) } : {}),
      ...(newest.actual.reps !== undefined ? { proposedReps: Math.max(bounds.minReps, newest.actual.reps - bounds.repStep) } : {}),
      ...(newest.actual.holdSeconds !== undefined ? { proposedHoldSeconds: Math.max(bounds.minHoldSeconds, newest.actual.holdSeconds - bounds.holdStep) } : {}),
    };
  }

  if (recent.length === 2 && recent.every((entry) => qualifies(entry.log))) {
    const planned = newest.planned;
    const proposedReps = planned.reps !== undefined && planned.reps + bounds.repStep <= bounds.maxReps
      ? planned.reps + bounds.repStep
      : undefined;
    const proposedHoldSeconds = planned.holdSeconds !== undefined && planned.holdSeconds + bounds.holdStep <= bounds.maxHoldSeconds
      ? planned.holdSeconds + bounds.holdStep
      : undefined;
    const proposedSets = proposedReps === undefined && proposedHoldSeconds === undefined && planned.sets + bounds.setStep <= bounds.maxSets
      ? planned.sets + bounds.setStep
      : undefined;
    const replacementExerciseId = proposedReps === undefined && proposedHoldSeconds === undefined && proposedSets === undefined
      ? variationId(exercise?.progression)
      : undefined;
    const step =
      proposedReps !== undefined
        ? `+${bounds.repStep} reps (up to ${bounds.maxReps})`
        : proposedHoldSeconds !== undefined
          ? `+${bounds.holdStep}s holds (up to ${bounds.maxHoldSeconds}s)`
          : proposedSets !== undefined
            ? "+1 set"
            : "a harder variation";
    return {
      action: "progress",
      reason: `Two manageable sessions in a row — suggested step: ${step}. You can override this.`,
      ruleVersion: PROGRESSION_RULE_VERSION,
      sourceSessionIds,
      ...(proposedSets === undefined ? {} : { proposedSets }),
      ...(proposedReps === undefined ? {} : { proposedReps }),
      ...(proposedHoldSeconds === undefined ? {} : { proposedHoldSeconds }),
      ...(replacementExerciseId ? { replacementExerciseId } : {}),
    };
  }

  if (recent.length === 2 && recent.every((entry) => !qualifies(entry.log))) {
    const proposedReps = newest.actual.reps === undefined
      ? undefined
      : Math.max(bounds.minReps, newest.actual.reps - bounds.repStep);
    const proposedHoldSeconds = newest.actual.holdSeconds === undefined
      ? undefined
      : Math.max(bounds.minHoldSeconds, newest.actual.holdSeconds - bounds.holdStep);
    return {
      action: "regress",
      reason: "Two tough exposures — consider the easier variation before adding work.",
      ruleVersion: PROGRESSION_RULE_VERSION,
      sourceSessionIds,
      ...(variationId(exercise?.regression) ? { replacementExerciseId: variationId(exercise?.regression) } : {}),
      ...(proposedReps === undefined ? {} : { proposedReps }),
      ...(proposedHoldSeconds === undefined ? {} : { proposedHoldSeconds }),
    };
  }

  return {
    action: "hold",
    reason: "Keep the current level until two easy sessions stack up.",
    ruleVersion: PROGRESSION_RULE_VERSION,
    sourceSessionIds,
  };
}
