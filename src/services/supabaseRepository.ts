import type { SupabaseClient } from "@supabase/supabase-js";
import { FOODS, foodById } from "@/constants/foods";
import { SAVED_MEALS } from "@/constants/meals";
import { generateGroceryList, mergeGroceryLists } from "@/utility/grocery";
import { buildDailyTarget } from "@/utility/health";
import { generateMealPlan } from "@/utility/mealPlan";
import { generateWorkoutPlan } from "@/utility/plan";
import { startOfWeek, todayKey } from "@/utility/dates";
import type {
  AppSnapshot,
  MealPlan,
  UserProfile,
  WorkoutPlan,
  WorkoutSession,
} from "@/types/domain";
import type { Database, Json } from "@/types/database.generated";
import type {
  AbandonSessionInput,
  AddCustomGroceryInput,
  ArchiveMealInput,
  DeleteAccountInput,
  DeleteNutritionInput,
  EditMealPlanInput,
  ExportInput,
  ExportOutcome,
  FinishSessionInput,
  GroceryMutationInput,
  MutationOutcome,
  ConflictDetails,
  NutritionInput,
  SavedMealLogInput,
  OnboardingInput,
  ProfileUpdateInput,
  RegenerateGroceryInput,
  RepositoryError,
  ResetPlanInput,
  SaveMealInput,
  SaveSessionInput,
  SkipPlannedMealInput,
  StartSessionInput,
  UpdateUnitsInput,
  WeightInput,
  WorkoutPlanOverrideInput,
  RemoveWorkoutOverrideInput,
  ProgressionDecisionInput,
  HistoryQuery,
  HistoryReadModel,
} from "@/types/backend";
import { loadAppSnapshot, loadHistoryReadModel } from "@/services/supabaseSnapshot";
import type { SnapshotRepository } from "@/services/repository";

type RpcName =
  | "complete_onboarding"
  | "update_profile"
  | "update_units"
  | "reset_plan"
  | "skip_planned_meal"
  | "edit_meal_plan"
  | "start_workout_session"
  | "save_workout_session"
  | "finish_workout_session"
  | "abandon_workout_session"
  | "save_nutrition_log"
  | "log_saved_meal"
  | "apply_workout_override"
  | "remove_workout_override"
  | "apply_progression_decision"
  | "delete_nutrition_log"
  | "save_weight_entry"
  | "save_saved_meal"
  | "save_recipe"
  | "archive_saved_meal"
  | "toggle_grocery_item"
  | "set_grocery_quantity"
  | "remove_grocery_item"
  | "add_custom_grocery_item"
  | "regenerate_grocery"
  | "export_account_data"
  | "delete_account";

const ERROR_CODES: RepositoryError["code"][] = [
  "not_authenticated",
  "validation_failed",
  "not_found",
  "conflict",
  "stale_version",
  "idempotency_key_reused",
  "already_completed",
  "retryable",
  "internal",
];

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const newId = (prefix: string, stableKey?: string) =>
  stableKey
    ? `${prefix}-${stableHash(stableKey)}`
    : `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

const idempotencyKey = () => newId("idem");

function isObject(value: Json | null | undefined): value is { [key: string]: Json | undefined } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asRefs(value: Json | undefined): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" ? [[key, entry]] : [],
    ),
  );
}

function toRepositoryError(message: string, status?: number, detailsText?: string): RepositoryError {
  const code = ERROR_CODES.find((candidate) => message.includes(candidate))
    ?? (status === 401 ? "not_authenticated" : status && status >= 500 ? "retryable" : "internal");
  let details: ConflictDetails | undefined;
  if (code === "stale_version" && detailsText) {
    try {
      const parsed = JSON.parse(detailsText) as Partial<ConflictDetails>;
      if (typeof parsed.entity === "string") {
        details = {
          entity: parsed.entity,
          expected: typeof parsed.expected === "number" ? parsed.expected : undefined,
          actual: typeof parsed.actual === "number" ? parsed.actual : undefined,
          refreshedSnapshotAvailable: parsed.refreshedSnapshotAvailable !== false,
        };
      }
    } catch {
      // PostgREST may expose detail as plain text; the stable error code survives.
    }
  }
  return {
    code,
    message,
    retryable: code === "retryable" || code === "conflict",
    ...(details ? { details } : {}),
  };
}

function repositoryException(error: RepositoryError): Error {
  const result = new Error(error.message);
  Object.assign(result, { repositoryError: error });
  return result;
}

function profileBundle(
  profile: UserProfile,
  effectiveDate: string,
  groceryOverride?: AppSnapshot["grocery"],
  mealPlanOverride?: MealPlan,
  planOverride?: AppSnapshot["plan"],
  workoutOverrides: AppSnapshot["workoutOverrides"] = [],
) {
  let target: ReturnType<typeof buildDailyTarget>;
  try {
    target = buildDailyTarget(profile, effectiveDate);
  } catch (error) {
    if (error instanceof Error && error.name === "UnsupportedTargetError") {
      throw repositoryException(toRepositoryError(`validation_failed: ${error.message}`));
    }
    throw error;
  }
  const generatedPlan = planOverride ?? generateWorkoutPlan(profile, target.id, effectiveDate);
  const plan: WorkoutPlan = {
    ...generatedPlan,
    workouts: generatedPlan.workouts.map((workout) => ({
      ...workout,
      exercises: workout.exercises.map((exercise) => {
        const override = workoutOverrides.find((candidate) => candidate.plannedExerciseId === exercise.id);
        if (!override) return exercise;
        return {
          ...exercise,
          ...(override.replacementExerciseId ? { exerciseId: override.replacementExerciseId } : {}),
          ...(override.sets === undefined ? {} : { sets: override.sets }),
          ...(override.reps === undefined ? {} : { reps: override.reps }),
          ...(override.holdSeconds === undefined ? {} : { holdSeconds: override.holdSeconds }),
          ...(override.restSeconds === undefined ? {} : { restSeconds: override.restSeconds }),
        };
      }),
    })),
  };
  const mealPlan = mealPlanOverride ?? generateMealPlan(
    target.id,
    startOfWeek(effectiveDate),
    profile,
  );
  const generatedGrocery = generateGroceryList(
    mealPlan,
    SAVED_MEALS,
    FOODS,
    mealPlan.weekOf,
  );
  const grocery = groceryOverride
    ? mergeGroceryLists(groceryOverride, generatedGrocery)
    : generatedGrocery;

  return {
    profile,
    target,
    plan,
    mealPlan,
    grocery,
    effectiveDate,
  };
}

/**
 * Name and display-unit edits do not alter health or plan inputs. Keeping the
 * comparison explicit prevents a harmless profile edit from creating a new
 * target/plan version and preserves the historical prescription.
 */
function hasSamePlanInputs(current: UserProfile, next: UserProfile) {
  const comparable = (profile: UserProfile) => ({
    age: profile.age,
    sex: profile.sex,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    experience: profile.experience,
    equipment: profile.equipment,
    daysPerWeek: profile.daysPerWeek,
    sessionMinutes: profile.sessionMinutes,
    goal: profile.goal,
    dietaryPattern: profile.dietaryPattern,
    allergies: profile.allergies,
    foodPreferences: profile.foodPreferences,
    cookingTimeMinutes: profile.cookingTimeMinutes,
    mealBudget: profile.mealBudget,
    targetEligibility: profile.targetEligibility ?? "eligible",
    eligibilityVersion: profile.eligibilityVersion ?? "calicoach-eligibility-v1",
  });
  return JSON.stringify(comparable(current)) === JSON.stringify(comparable(next));
}

function sessionPayload(session: WorkoutSession, snapshot: AppSnapshot) {
  const workout = snapshot.plan?.workouts.find(
    (candidate) => candidate.id === session.plannedWorkoutId,
  );
  return {
    ...session,
    logs: session.logs.map((log, index) => ({
      ...log,
      plannedExerciseId: log.plannedExerciseId ?? workout?.exercises[index]?.id ?? log.exerciseId,
      actualExerciseId: log.exerciseId,
    })),
  };
}

function expectedVersionsForSnapshot(snapshot: AppSnapshot) {
  return {
    profileRevision: snapshot.profile?.revision,
    goalVersion: snapshot.goal?.version,
    targetVersion: snapshot.target?.version,
    workoutPlanVersion: snapshot.plan?.version,
    mealPlanVersion: snapshot.mealPlan?.version,
    groceryRevision: snapshot.grocery?.revision,
  };
}

function goalPayload(goal: OnboardingInput["goal"] | undefined) {
  return goal
    ? {
        targetWeightKg: goal.targetWeightKg,
        desiredRateKgPerWeek: goal.desiredRateKgPerWeek,
        targetDate: goal.targetDate,
        weeklyWorkoutTarget: goal.weeklyWorkoutTarget,
        skillTargets: goal.skillTargets,
      }
    : {};
}

export class SupabaseSnapshotRepository implements SnapshotRepository {
  private readonly client: SupabaseClient<Database>;

  constructor(client: SupabaseClient<Database>) {
    this.client = client;
  }

  async load(): Promise<AppSnapshot | null> {
    const { data, error } = await this.client.auth.getClaims();
    if (error) {
      throw repositoryException(toRepositoryError(error.message, error.status));
    }
    const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    return userId ? loadAppSnapshot(this.client, userId) : null;
  }

  async loadHistory(query: HistoryQuery = {}): Promise<HistoryReadModel> {
    const { data, error } = await this.client.auth.getClaims();
    if (error) throw repositoryException(toRepositoryError(error.message, error.status));
    const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    if (!userId) throw repositoryException(toRepositoryError("not_authenticated", 401));
    try {
      return await loadHistoryReadModel(this.client, userId, query);
    } catch (reason: unknown) {
      throw repositoryException(toRepositoryError(reason instanceof Error ? `validation_failed: ${reason.message}` : "retryable: history could not be loaded"));
    }
  }

  private async mutate(
    name: RpcName,
    payload: Record<string, unknown>,
    events: MutationOutcome["events"] = [],
  ): Promise<MutationOutcome> {
    const { data, error } = await this.client.rpc(name, {
      p_payload: payload as Json,
    });
    if (error) {
      throw repositoryException(toRepositoryError(error.message, undefined, error.details));
    }

    const result = isObject(data) ? data : {};
    const snapshot = await this.load();
    if (!snapshot) {
      throw repositoryException(toRepositoryError("not_authenticated", 401));
    }

    return {
      snapshot,
      events,
      resultRefs: asRefs(result.result_refs),
    };
  }

  async completeOnboarding(input: OnboardingInput): Promise<MutationOutcome> {
    if (input.profile.targetEligibility === "unsupported") {
      return this.mutate(
        "complete_onboarding",
        {
          profile: input.profile,
          ...goalPayload(input.goal),
          idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
        },
        [{ type: "profile-updated" }],
      );
    }
    const bundle = profileBundle(input.profile, todayKey(), input.currentSnapshot.grocery, undefined, undefined, input.currentSnapshot.workoutOverrides);
    return this.mutate(
      "complete_onboarding",
      { ...bundle, ...goalPayload(input.goal), idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
      [
        { type: "profile-updated" },
        { type: "target-updated", targetId: bundle.target.id },
        { type: "plan-generated", planId: bundle.plan.id },
      ],
    );
  }

  async updateProfile(input: ProfileUpdateInput): Promise<MutationOutcome> {
    const profileOnly = Boolean(
      input.currentSnapshot.profile && hasSamePlanInputs(input.currentSnapshot.profile, input.profile),
    );
    if (profileOnly) {
      return this.mutate(
        "update_profile",
        {
          profile: input.profile,
          profileOnly: true,
          expectedVersions: input.expectedVersions ?? {
            profileRevision: input.currentSnapshot.profile?.revision,
          },
          idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
        },
        [{ type: "profile-updated" }],
      );
    }
    if (input.profile.targetEligibility === "unsupported") {
      return this.mutate(
        "update_profile",
        {
          profile: input.profile,
          ...goalPayload(input.goal),
          expectedVersions: input.expectedVersions ?? expectedVersionsForSnapshot(input.currentSnapshot),
          idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
        },
        [{ type: "profile-updated" }],
      );
    }
    const bundle = profileBundle(input.profile, todayKey(), input.currentSnapshot.grocery, undefined, undefined, input.currentSnapshot.workoutOverrides);
    return this.mutate(
      "update_profile",
      { ...bundle, ...goalPayload(input.goal), expectedVersions: input.expectedVersions ?? expectedVersionsForSnapshot(input.currentSnapshot), idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
      [
        { type: "profile-updated" },
        { type: "target-updated", targetId: bundle.target.id },
        { type: "plan-generated", planId: bundle.plan.id },
      ],
    );
  }

  async updateUnits(input: UpdateUnitsInput): Promise<MutationOutcome> {
    if (!input.currentSnapshot.profile) {
      throw repositoryException(toRepositoryError("validation_failed: profile is required"));
    }
    const profile = { ...input.currentSnapshot.profile, units: input.units };
    // Eligibility metadata is preserved server-side for a display-unit edit;
    // omitting it also keeps the shared validator from treating this as a new
    // health-screening decision for an unsupported profile.
    const profilePayload = {
      ...profile,
      targetEligibility: undefined,
      eligibilityVersion: undefined,
    };
    return this.mutate(
      "update_units",
      {
        profile: profilePayload,
        profileOnly: true,
        expectedVersions: input.expectedVersions ?? { profileRevision: input.currentSnapshot.profile.revision },
        idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
      },
      [{ type: "profile-updated" }],
    );
  }

  async startSession(input: StartSessionInput): Promise<MutationOutcome> {
    const mutationKey = input.idempotencyKey ?? idempotencyKey();
    const session: WorkoutSession = {
      id: newId("ws", input.idempotencyKey),
      plannedWorkoutId: input.workoutId,
      plannedPlanVersion: input.currentSnapshot.plan?.version,
      date: todayKey(),
      startedAt: new Date().toISOString(),
      status: "in_progress",
      logs: [],
    };
    return this.mutate("start_workout_session", {
      session,
      expectedVersions: input.expectedVersions ?? { workoutPlanVersion: input.currentSnapshot.plan?.version },
      idempotencyKey: mutationKey,
    });
  }

  async saveSession(input: SaveSessionInput): Promise<MutationOutcome> {
    return this.mutate("save_workout_session", {
      session: sessionPayload(input.session, input.currentSnapshot),
      expectedVersions: input.expectedVersions ?? { workoutPlanVersion: input.currentSnapshot.plan?.version },
      idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
    });
  }

  async finishSession(input: FinishSessionInput): Promise<MutationOutcome> {
    const outcome = await this.mutate("finish_workout_session", {
      session: sessionPayload(input.session, input.currentSnapshot),
      finishedAt: new Date().toISOString(),
      expectedVersions: input.expectedVersions ?? { workoutPlanVersion: input.currentSnapshot.plan?.version },
      idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
    });
    const sessionStatus = outcome.resultRefs?.session_status;
    return {
      ...outcome,
      events: [
        {
          type:
            sessionStatus === "completed"
              ? "workout-completed"
              : "workout-partially-logged",
          sessionId: input.session.id,
        },
      ],
    };
  }

  async abandonSession(input: AbandonSessionInput): Promise<MutationOutcome> {
    return this.mutate("abandon_workout_session", {
      session: { id: input.sessionId },
      expectedVersions: input.expectedVersions ?? { workoutPlanVersion: input.currentSnapshot.plan?.version },
      idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
    });
  }

  async saveNutrition(input: NutritionInput): Promise<MutationOutcome> {
    const mutationKey = input.idempotencyKey ?? idempotencyKey();
    const id = newId("nl", input.idempotencyKey);
    const food = input.entry.foodId ? foodById(input.entry.foodId) : undefined;
    const entry = {
      ...input.entry,
      id,
      servingQuantity: input.entry.servings,
      servingUnit: food?.unit ?? "serving",
      sourceVersion: food?.sourceVersion ?? "",
      preparationBasis: "as_labeled",
    };
    return this.mutate(
      "save_nutrition_log",
      { entry, idempotencyKey: mutationKey },
      [{ type: "nutrition-entry-saved", entryId: id }],
    );
  }

  async deleteNutrition(input: DeleteNutritionInput): Promise<MutationOutcome> {
    return this.mutate(
      "delete_nutrition_log",
      { nutritionLogId: input.id, expectedVersions: input.expectedVersions, idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
    );
  }

  async saveWeight(input: WeightInput): Promise<MutationOutcome> {
    const mutationKey = input.idempotencyKey ?? idempotencyKey();
    const id = newId("we", input.idempotencyKey);
    return this.mutate(
      "save_weight_entry",
      {
        entry: { id, date: input.date, weightKg: input.weightKg },
        idempotencyKey: mutationKey,
      },
      [{ type: "weight-entry-added", entryId: id }],
    );
  }

  async updateGrocery(
    input: GroceryMutationInput,
    currentSnapshot: AppSnapshot,
  ): Promise<MutationOutcome> {
    const functionName: RpcName =
      input.type === "toggle"
        ? "toggle_grocery_item"
        : input.type === "quantity"
          ? "set_grocery_quantity"
          : "remove_grocery_item";
    const payload: Record<string, unknown> = {
      itemId: input.itemId,
      expectedVersions: input.expectedVersions ?? expectedVersionsForSnapshot(currentSnapshot),
      idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
    };
    if (input.type === "quantity") payload.quantity = input.quantity;
    return this.mutate(functionName, payload, [
      { type: "grocery-list-updated", listId: currentSnapshot.grocery?.id ?? "" },
    ]);
  }

  async addCustomGrocery(input: AddCustomGroceryInput): Promise<MutationOutcome> {
    const mutationKey = input.idempotencyKey ?? idempotencyKey();
    const item = {
      id: newId("gi-custom", input.idempotencyKey),
      name: input.name,
      category: "Other",
      unit: input.unit,
      generatedQuantity: input.quantity,
      quantity: input.quantity,
      checked: false,
      custom: true,
    };
    return this.mutate(
      "add_custom_grocery_item",
      {
        grocery: input.currentSnapshot.grocery,
        expectedVersions: input.expectedVersions ?? expectedVersionsForSnapshot(input.currentSnapshot),
        item,
        idempotencyKey: mutationKey,
      },
      [
        {
          type: "grocery-list-updated",
          listId: input.currentSnapshot.grocery?.id ?? "",
        },
      ],
    );
  }

  async regenerateGrocery(input: RegenerateGroceryInput): Promise<MutationOutcome> {
    return this.mutate(
      "regenerate_grocery",
      {
        grocery: input.currentSnapshot.grocery,
        expectedVersions: input.expectedVersions ?? expectedVersionsForSnapshot(input.currentSnapshot),
        idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
      },
      [
        {
          type: "grocery-list-updated",
          listId: input.currentSnapshot.grocery?.id ?? "",
        },
      ],
    );
  }

  async skipPlannedMeal(input: SkipPlannedMealInput): Promise<MutationOutcome> {
    if (!input.currentSnapshot.profile || !input.currentSnapshot.mealPlan) {
      throw repositoryException(toRepositoryError("validation_failed: profile and meal plan are required"));
    }
    const mealPlan = {
      ...input.currentSnapshot.mealPlan,
      meals: input.currentSnapshot.mealPlan.meals.map((meal) =>
        meal.id === input.id ? { ...meal, skipped: !meal.skipped } : meal,
      ),
    };
    const bundle = profileBundle(
      input.currentSnapshot.profile,
      todayKey(),
      input.currentSnapshot.grocery,
      mealPlan,
      undefined,
      input.currentSnapshot.workoutOverrides,
    );
    return this.mutate(
      "skip_planned_meal",
      { ...bundle, expectedVersions: input.expectedVersions ?? expectedVersionsForSnapshot(input.currentSnapshot), idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
      [{ type: "grocery-list-updated", listId: bundle.grocery.id }],
    );
  }

  async resetPlan(input: ResetPlanInput): Promise<MutationOutcome> {
    if (!input.currentSnapshot.profile) {
      throw repositoryException(toRepositoryError("validation_failed: profile is required"));
    }
    const bundle = profileBundle(
      input.currentSnapshot.profile,
      todayKey(),
      input.currentSnapshot.grocery,
      undefined,
      undefined,
      input.currentSnapshot.workoutOverrides,
    );
    return this.mutate(
      "reset_plan",
      { ...bundle, expectedVersions: input.expectedVersions ?? expectedVersionsForSnapshot(input.currentSnapshot), idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
      [{ type: "plan-generated", planId: bundle.plan.id }],
    );
  }

  async saveSavedMealLog(input: SavedMealLogInput): Promise<MutationOutcome> {
    const mutationKey = input.idempotencyKey ?? idempotencyKey();
    const entries = input.entries.map((entry, index) => {
      const food = entry.foodId ? foodById(entry.foodId) : undefined;
      return {
        ...entry,
        id: newId("nl", `${mutationKey}:${index}:${entry.foodId ?? entry.customName ?? "entry"}`),
        servingQuantity: entry.servings,
        servingUnit: food?.unit ?? "serving",
        sourceVersion: food?.sourceVersion ?? "",
        preparationBasis: "as_labeled",
      };
    });
    return this.mutate(
      "log_saved_meal",
      { date: input.date, slot: input.slot, entries, idempotencyKey: mutationKey },
      [{ type: "meal-logged", entryIds: entries.map((entry) => entry.id) }],
    );
  }

  async editMealPlan(input: EditMealPlanInput): Promise<MutationOutcome> {
    if (!input.currentSnapshot.mealPlan) {
      throw repositoryException(toRepositoryError("validation_failed: meal plan is required"));
    }
    const mealsById = new Map(
      [...SAVED_MEALS, ...input.currentSnapshot.savedMeals].map((meal) => [meal.id, meal]),
    );
    const generatedGrocery = generateGroceryList(
      input.mealPlan,
      [...mealsById.values()],
      FOODS,
      input.mealPlan.weekOf,
    );
    const grocery = input.currentSnapshot.grocery
      ? mergeGroceryLists(input.currentSnapshot.grocery, generatedGrocery)
      : generatedGrocery;
    return this.mutate(
      "edit_meal_plan",
      {
        mealPlan: input.mealPlan,
        grocery,
        expectedVersions: input.expectedVersions ?? {
          mealPlanVersion: input.currentSnapshot.mealPlan.version,
          groceryRevision: input.currentSnapshot.grocery?.revision,
        },
        idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
      },
      [
        { type: "plan-edited", planId: input.mealPlan.id },
        { type: "grocery-list-updated", listId: grocery.id },
      ],
    );
  }

  async applyWorkoutOverride(input: WorkoutPlanOverrideInput): Promise<MutationOutcome> {
    if (!input.currentSnapshot.profile || !input.currentSnapshot.plan) {
      throw repositoryException(toRepositoryError("validation_failed: profile and plan are required"));
    }
    return this.mutate(
      "apply_workout_override",
      {
        slotKey: input.slotKey,
        plannedExerciseId: input.plannedExerciseId,
        replacementExerciseId: input.replacementExerciseId,
        sets: input.sets,
        reps: input.reps,
        holdSeconds: input.holdSeconds,
        restSeconds: input.restSeconds,
        expectedVersions: input.expectedVersions ?? { workoutPlanVersion: input.currentSnapshot.plan.version },
        idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
      },
      [{ type: "plan-edited", planId: input.currentSnapshot.plan.id }],
    );
  }

  async removeWorkoutOverride(input: RemoveWorkoutOverrideInput): Promise<MutationOutcome> {
    if (!input.currentSnapshot.profile || !input.currentSnapshot.plan) {
      throw repositoryException(toRepositoryError("validation_failed: profile and plan are required"));
    }
    return this.mutate(
      "remove_workout_override",
      {
        slotKey: input.slotKey,
        plannedExerciseId: input.plannedExerciseId,
        expectedVersions: input.expectedVersions ?? { workoutPlanVersion: input.currentSnapshot.plan.version },
        idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
      },
      [{ type: "workout-override-removed", planId: input.currentSnapshot.plan.id }],
    );
  }

  async applyProgressionDecision(input: ProgressionDecisionInput): Promise<MutationOutcome> {
    if (!input.currentSnapshot.profile || !input.currentSnapshot.plan) {
      throw repositoryException(toRepositoryError("validation_failed: profile and plan are required"));
    }
    const outcome = await this.mutate(
      "apply_progression_decision",
      {
        slotKey: input.slotKey,
        plannedExerciseId: input.plannedExerciseId,
        action: input.action,
        decision: input.decision,
        ruleVersion: input.ruleVersion,
        sourceSessionIds: input.sourceSessionIds,
        replacementExerciseId: input.replacementExerciseId,
        sets: input.sets,
        reps: input.reps,
        holdSeconds: input.holdSeconds,
        restSeconds: input.restSeconds,
        expectedVersions: input.expectedVersions ?? { workoutPlanVersion: input.currentSnapshot.plan.version },
        idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
      },
      [],
    );
    return {
      ...outcome,
      events: [{
        type: "progression-decision-saved",
        decisionId: outcome.resultRefs?.decision_id ?? input.idempotencyKey ?? "decision",
      }],
    };
  }

  async saveMeal(input: SaveMealInput): Promise<MutationOutcome> {
    const savedMeals = [...input.currentSnapshot.savedMeals.filter((meal) => meal.id !== input.meal.id), input.meal];
    const grocery = input.currentSnapshot.mealPlan
      ? mergeGroceryLists(
          input.currentSnapshot.grocery ?? generateGroceryList(input.currentSnapshot.mealPlan, savedMeals, FOODS, input.currentSnapshot.mealPlan.weekOf),
          generateGroceryList(input.currentSnapshot.mealPlan, savedMeals, FOODS, input.currentSnapshot.mealPlan.weekOf),
        )
      : input.currentSnapshot.grocery;
    return this.mutate(
      "save_saved_meal",
      { meal: input.meal, grocery, expectedVersions: input.expectedVersions, idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
      [
        { type: "meal-saved", mealId: input.meal.id },
        ...(grocery ? [{ type: "grocery-list-updated" as const, listId: grocery.id }] : []),
      ],
    );
  }

  async archiveMeal(input: ArchiveMealInput): Promise<MutationOutcome> {
    return this.mutate(
      "archive_saved_meal",
      {
        mealId: input.mealId,
        expectedVersions: input.expectedVersions,
        idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
      },
      [{ type: "meal-archived", mealId: input.mealId }],
    );
  }

  async exportData(input: ExportInput = {}): Promise<ExportOutcome> {
    const { data, error } = await this.client.rpc("export_account_data", {
      p_payload: { idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
    });
    if (error) {
      throw repositoryException(toRepositoryError(error.message));
    }
    const result = isObject(data) ? data : {};
    return {
      data: result.data ?? null,
      events: [{ type: "data-exported" }],
    };
  }

  async deleteAccount(input: DeleteAccountInput): Promise<MutationOutcome> {
    if (input.confirmation !== "DELETE") {
      throw repositoryException(toRepositoryError("validation_failed: type DELETE to confirm"));
    }
    const result = await this.client.rpc("delete_account", {
      p_payload: { idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
    });
    if (result.error) {
      throw repositoryException(toRepositoryError(result.error.message));
    }
    return {
      snapshot: {
        schemaVersion: 1,
        userId: "",
        onboarded: false,
        profile: null,
        goal: null,
        target: null,
        plan: null,
        workoutOverrides: [],
        mealPlan: null,
        sessions: [],
        nutritionLogs: [],
        weights: [],
        grocery: null,
        savedMeals: [],
        progressionDecisions: [],
      },
      events: [{ type: "data-erased" }],
      resultRefs: asRefs(isObject(result.data) ? result.data.result_refs : undefined),
    };
  }
}

export function createSupabaseRepository(
  client: SupabaseClient<Database>,
): SnapshotRepository {
  return new SupabaseSnapshotRepository(client);
}
