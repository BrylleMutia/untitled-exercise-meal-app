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
  WorkoutSession,
} from "@/types/domain";
import type { Database, Json } from "@/types/database.generated";
import type {
  AbandonSessionInput,
  AddCustomGroceryInput,
  DeleteAccountInput,
  DeleteNutritionInput,
  ExportInput,
  ExportOutcome,
  FinishSessionInput,
  GroceryMutationInput,
  MutationOutcome,
  NutritionInput,
  OnboardingInput,
  RegenerateGroceryInput,
  RepositoryError,
  ResetPlanInput,
  SaveMealInput,
  SaveSessionInput,
  SkipPlannedMealInput,
  StartSessionInput,
  UpdateUnitsInput,
  WeightInput,
} from "@/types/backend";
import { loadAppSnapshot } from "@/services/supabaseSnapshot";
import type { SnapshotRepository } from "@/services/repository";

type RpcName =
  | "complete_onboarding"
  | "update_profile"
  | "update_units"
  | "reset_plan"
  | "skip_planned_meal"
  | "start_workout_session"
  | "save_workout_session"
  | "finish_workout_session"
  | "abandon_workout_session"
  | "save_nutrition_log"
  | "delete_nutrition_log"
  | "save_weight_entry"
  | "save_saved_meal"
  | "save_recipe"
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

function toRepositoryError(message: string, status?: number): RepositoryError {
  const code = ERROR_CODES.find((candidate) => message.includes(candidate))
    ?? (status === 401 ? "not_authenticated" : status && status >= 500 ? "retryable" : "internal");
  return {
    code,
    message,
    retryable: code === "retryable" || code === "conflict",
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
) {
  const target = buildDailyTarget(profile, effectiveDate);
  const plan = generateWorkoutPlan(profile, target.id, effectiveDate);
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

function sessionPayload(session: WorkoutSession, snapshot: AppSnapshot) {
  const workout = snapshot.plan?.workouts.find(
    (candidate) => candidate.id === session.plannedWorkoutId,
  );
  return {
    ...session,
    logs: session.logs.map((log, index) => ({
      ...log,
      plannedExerciseId: workout?.exercises[index]?.id ?? log.exerciseId,
      actualExerciseId: log.exerciseId,
    })),
  };
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

  private async mutate(
    name: RpcName,
    payload: Record<string, unknown>,
    events: MutationOutcome["events"] = [],
  ): Promise<MutationOutcome> {
    const { data, error } = await this.client.rpc(name, {
      p_payload: payload as Json,
    });
    if (error) {
      throw repositoryException(toRepositoryError(error.message));
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
    const bundle = profileBundle(input.profile, todayKey(), input.currentSnapshot.grocery);
    return this.mutate(
      "complete_onboarding",
      { ...bundle, idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
      [
        { type: "profile-updated" },
        { type: "target-updated", targetId: bundle.target.id },
        { type: "plan-generated", planId: bundle.plan.id },
      ],
    );
  }

  async updateProfile(input: OnboardingInput): Promise<MutationOutcome> {
    const bundle = profileBundle(input.profile, todayKey(), input.currentSnapshot.grocery);
    return this.mutate(
      "update_profile",
      { ...bundle, idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
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
    const bundle = profileBundle(profile, todayKey(), input.currentSnapshot.grocery);
    return this.mutate(
      "update_units",
      { ...bundle, idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
      [
        { type: "profile-updated" },
        { type: "target-updated", targetId: bundle.target.id },
        { type: "plan-generated", planId: bundle.plan.id },
      ],
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
      idempotencyKey: mutationKey,
    });
  }

  async saveSession(input: SaveSessionInput): Promise<MutationOutcome> {
    return this.mutate("save_workout_session", {
      session: sessionPayload(input.session, input.currentSnapshot),
      idempotencyKey: input.idempotencyKey ?? idempotencyKey(),
    });
  }

  async finishSession(input: FinishSessionInput): Promise<MutationOutcome> {
    const outcome = await this.mutate("finish_workout_session", {
      session: sessionPayload(input.session, input.currentSnapshot),
      finishedAt: new Date().toISOString(),
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
      { nutritionLogId: input.id, idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
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
    void currentSnapshot;
    const functionName: RpcName =
      input.type === "toggle"
        ? "toggle_grocery_item"
        : input.type === "quantity"
          ? "set_grocery_quantity"
          : "remove_grocery_item";
    const payload: Record<string, unknown> = {
      itemId: input.itemId,
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
    );
    return this.mutate(
      "skip_planned_meal",
      { ...bundle, idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
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
    );
    return this.mutate(
      "reset_plan",
      { ...bundle, idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
      [{ type: "plan-generated", planId: bundle.plan.id }],
    );
  }

  async saveMeal(input: SaveMealInput): Promise<MutationOutcome> {
    return this.mutate(
      "save_saved_meal",
      { meal: input.meal, idempotencyKey: input.idempotencyKey ?? idempotencyKey() },
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
        target: null,
        plan: null,
        mealPlan: null,
        sessions: [],
        nutritionLogs: [],
        weights: [],
        grocery: null,
        savedMeals: [],
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
