import type {
  AppSnapshot,
  MealPlan,
  SemanticEvent,
  UserProfile,
  WorkoutSession,
  NutritionLog,
  LoggedMeal,
  Meal,
  UnitSystem,
  ProgressionAction,
  WeightEntry,
  Food,
  NutritionServingUnit,
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
  data: AccountExport | null;
  events: SemanticEvent[];
};

export type AccountExportValue =
  | string
  | number
  | boolean
  | null
  | AccountExportValue[]
  | { [key: string]: AccountExportValue };

export type AccountExportRow = { [key: string]: AccountExportValue };

/** The exact scalar and entity collections returned by export_account_data. */
export type AccountExport = {
  exportedAt: string;
  profile: AccountExportRow | null;
  goals: AccountExportRow[];
  dailyTargets: AccountExportRow[];
  workoutPlans: AccountExportRow[];
  plannedWorkouts: AccountExportRow[];
  plannedExercises: AccountExportRow[];
  workoutPlanOverrides: AccountExportRow[];
  mealPlans: AccountExportRow[];
  plannedMeals: AccountExportRow[];
  workoutSessions: AccountExportRow[];
  exerciseLogs: AccountExportRow[];
  nutritionLogs: AccountExportRow[];
  foods: AccountExportRow[];
  weightEntries: AccountExportRow[];
  groceryLists: AccountExportRow[];
  groceryItems: AccountExportRow[];
  savedMeals: AccountExportRow[];
  savedMealIngredients: AccountExportRow[];
  loggedMeals: AccountExportRow[];
};

export type IdempotentInput = {
  /** Reuse this key when retrying the same intent. */
  idempotencyKey?: string;
};

export type OnboardingInput = IdempotentInput & {
  profile: UserProfile;
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
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
  expectedVersions?: ExpectedVersions;
};

export type StartSessionInput = IdempotentInput & {
  workoutId: string;
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type SaveSessionInput = IdempotentInput & {
  session: WorkoutSession;
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type FinishSessionInput = SaveSessionInput;

export type AbandonSessionInput = IdempotentInput & {
  sessionId: string;
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type NutritionInput = IdempotentInput & {
  entry: Omit<NutritionLog, "id" | "createdAt"> & {
    servingQuantity?: number;
    servingUnit?: NutritionServingUnit;
  };
};

export type NotificationPreferenceInput = IdempotentInput & {
  enabled: boolean;
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type UpdateNutritionInput = IdempotentInput & {
  entry: NutritionLog;
  currentSnapshot?: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type SaveFoodInput = IdempotentInput & {
  food: Omit<Food, "id"> & { id?: string };
};

export type DeleteNutritionInput = IdempotentInput & {
  id: string;
  currentSnapshot?: AppSnapshot;
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
  expectedVersions?: ExpectedVersions;
};

export type RegenerateGroceryInput = IdempotentInput & {
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type SkipPlannedMealInput = IdempotentInput & {
  id: string;
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type EditMealPlanInput = IdempotentInput & {
  mealPlan: MealPlan;
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type ResetPlanInput = IdempotentInput & {
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type SavedMealLogInput = IdempotentInput & {
  date: string;
  slot: NutritionLog["slot"];
  entries: Array<Omit<NutritionLog, "id" | "createdAt">>;
  meal?: Meal;
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
  expectedVersions?: ExpectedVersions;
};

export type RemoveWorkoutOverrideInput = IdempotentInput & {
  slotKey: string;
  plannedExerciseId?: string;
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type ProgressionDecisionInput = IdempotentInput & {
  slotKey: string;
  plannedExerciseId: string;
  action: ProgressionAction;
  decision: "accepted" | "rejected";
  ruleVersion: string;
  sourceSessionIds: string[];
  replacementExerciseId?: string;
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  restSeconds?: number;
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type HistoryQuery = {
  from?: string;
  to?: string;
  limit?: number;
  sessionsCursor?: string;
  nutritionCursor?: string;
  weightsCursor?: string;
};

export type HistoryReadModel = {
  sessions: Array<{
    id: string;
    plannedWorkoutId: string;
    date: string;
    startedAt: string;
    finishedAt?: string;
    status: "in_progress" | "completed" | "partial" | "abandoned";
    loggedExerciseCount: number;
    completedExerciseCount: number;
  }>;
  nutritionLogs: NutritionLog[];
  weights: WeightEntry[];
  summary: {
    rangeFrom: string;
    rangeTo: string;
    scheduledWorkoutDays: number;
    completedWorkoutDays: number;
    partialWorkoutDays: number;
    skippedWorkoutDays: number;
    nutritionLoggedDays: number;
    nutritionCompleteDays: number;
    nutritionPartialDays: number;
    nutritionUnloggedDays: number;
  };
  nextCursors: {
    sessions?: string;
    nutrition?: string;
    weights?: string;
  };
};

export type SaveMealInput = IdempotentInput & {
  meal: Meal;
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type ArchiveMealInput = IdempotentInput & {
  mealId: string;
  currentSnapshot?: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type ReviewedMealIngredientInput = Omit<NutritionLog, "id" | "createdAt" | "loggedMealId" | "ingredientOrder"> & {
  ingredientOrder?: number;
};

export type SaveReviewedMealInput = IdempotentInput & {
  date: string;
  slot: NutritionLog["slot"];
  meal: Meal;
  name: string;
  sourceMode: LoggedMeal["sourceMode"];
  assumptions?: string;
  ingredients: ReviewedMealIngredientInput[];
};

export type UpdateLoggedMealInput = IdempotentInput & {
  loggedMeal: LoggedMeal;
  ingredients: ReviewedMealIngredientInput[];
  currentSnapshot: AppSnapshot;
  expectedVersions?: ExpectedVersions;
};

export type DeleteLoggedMealInput = IdempotentInput & {
  loggedMealId: string;
  expectedRevision: number;
  currentSnapshot: AppSnapshot;
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
