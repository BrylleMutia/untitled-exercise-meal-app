import type {
  AppSnapshot,
  SemanticEvent,
  UserProfile,
  WorkoutSession,
  NutritionLog,
  Meal,
  UnitSystem,
} from "@/types/domain";

export type MutationErrorCode =
  | "not_authenticated"
  | "validation_failed"
  | "not_found"
  | "conflict"
  | "stale_version"
  | "idempotency_key_reused"
  | "already_completed"
  | "retryable"
  | "internal";

export type ExpectedVersions = {
  profileRevision?: number;
  goalVersion?: number;
  targetVersion?: number;
  workoutPlanVersion?: number;
  mealPlanVersion?: number;
  groceryRevision?: number;
  recordRevision?: number;
};

export type ConflictDetails = {
  entity: string;
  expected?: number;
  actual?: number;
  refreshedSnapshotAvailable: boolean;
};

export type RepositoryError = {
  code: MutationErrorCode;
  message: string;
  retryable: boolean;
  details?: ConflictDetails;
};

export type MutationOutcome = {
  snapshot: AppSnapshot;
  events: SemanticEvent[];
  resultRefs?: Record<string, string>;
};

export type ExportOutcome = {
  data: unknown;
  events: SemanticEvent[];
};

export type IdempotentInput = {
  /** Reuse this key when retrying the same intent. */
  idempotencyKey?: string;
};

export type OnboardingInput = IdempotentInput & {
  profile: UserProfile;
  currentSnapshot: AppSnapshot;
  goal?: {
    targetWeightKg?: number;
    desiredRateKgPerWeek?: number;
    targetDate?: string;
    weeklyWorkoutTarget?: number;
    skillTargets?: Record<string, number>;
  };
};

export type ProfileUpdateInput = OnboardingInput & { expectedVersions?: ExpectedVersions };

export type UpdateUnitsInput = IdempotentInput & {
  units: UnitSystem;
  currentSnapshot: AppSnapshot;
};

export type StartSessionInput = IdempotentInput & {
  workoutId: string;
  currentSnapshot: AppSnapshot;
};

export type SaveSessionInput = IdempotentInput & {
  session: WorkoutSession;
  currentSnapshot: AppSnapshot;
};

export type FinishSessionInput = SaveSessionInput;

export type AbandonSessionInput = IdempotentInput & {
  sessionId: string;
  currentSnapshot: AppSnapshot;
};

export type NutritionInput = IdempotentInput & {
  entry: Omit<NutritionLog, "id" | "createdAt">;
};

export type DeleteNutritionInput = IdempotentInput & {
  id: string;
  expectedVersions?: ExpectedVersions;
};

export type WeightInput = IdempotentInput & {
  weightKg: number;
  date: string;
};

export type GroceryMutationInput =
  | (IdempotentInput & { type: "toggle"; itemId: string; expectedVersions?: ExpectedVersions })
  | (IdempotentInput & { type: "quantity"; itemId: string; quantity: number; expectedVersions?: ExpectedVersions })
  | (IdempotentInput & { type: "remove"; itemId: string; expectedVersions?: ExpectedVersions });

export type AddCustomGroceryInput = IdempotentInput & {
  name: string;
  quantity: number;
  unit: string;
  currentSnapshot: AppSnapshot;
};

export type RegenerateGroceryInput = IdempotentInput & {
  currentSnapshot: AppSnapshot;
};

export type SkipPlannedMealInput = IdempotentInput & {
  id: string;
  currentSnapshot: AppSnapshot;
};

export type ResetPlanInput = IdempotentInput & {
  currentSnapshot: AppSnapshot;
};

export type SavedMealLogInput = IdempotentInput & {
  date: string;
  slot: NutritionLog["slot"];
  entries: Array<Omit<NutritionLog, "id" | "createdAt">>;
};

export type WorkoutPlanOverrideInput = IdempotentInput & {
  slotKey: string;
  plannedExerciseId?: string;
  replacementExerciseId?: string;
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  restSeconds?: number;
  currentSnapshot: AppSnapshot;
};

export type SaveMealInput = IdempotentInput & {
  meal: Meal;
  expectedVersions?: ExpectedVersions;
};

export type DraftEnvelope<T> = {
  schemaVersion: number;
  userId: string;
  draftType: string;
  baseVersions: ExpectedVersions;
  updatedAt: string;
  expiresAt: string;
  payload: T;
};

export type ExportInput = IdempotentInput;

export type DeleteAccountInput = IdempotentInput & {
  confirmation: string;
};

export type RepositoryMutationError = Error & {
  repositoryError?: RepositoryError;
};
