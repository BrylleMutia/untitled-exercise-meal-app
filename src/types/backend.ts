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

export type RepositoryError = {
  code: MutationErrorCode;
  message: string;
  retryable: boolean;
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
};

export type ProfileUpdateInput = OnboardingInput;

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
};

export type WeightInput = IdempotentInput & {
  weightKg: number;
  date: string;
};

export type GroceryMutationInput =
  | (IdempotentInput & { type: "toggle"; itemId: string })
  | (IdempotentInput & { type: "quantity"; itemId: string; quantity: number })
  | (IdempotentInput & { type: "remove"; itemId: string });

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

export type SaveMealInput = IdempotentInput & {
  meal: Meal;
};

export type ExportInput = IdempotentInput;

export type DeleteAccountInput = IdempotentInput & {
  confirmation: string;
};

export type RepositoryMutationError = Error & {
  repositoryError?: RepositoryError;
};
