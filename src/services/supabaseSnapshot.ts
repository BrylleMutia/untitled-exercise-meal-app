import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database.generated";
import type {
  AppSnapshot,
  DailyTarget,
  EquipmentId,
  Exercise,
  ExerciseLog,
  Food,
  GroceryItem,
  Meal,
  MealPlan,
  NutritionLog,
  PlannedExercise,
  PlannedMeal,
  PreparationBasis,
  PlannedWorkout,
  UserProfile,
  WorkoutPlan,
  WorkoutSession,
  Goal,
  WorkoutPlanOverride,
  ProgressionDecision,
  LoggedMeal,
  MacroEstimateRange,
  NutritionValueSource,
} from "@/types/domain";
import type { HistoryQuery, HistoryReadModel } from "@/types/backend";
import { addDays, todayKey } from "@/utility/dates";

type AppSupabaseClient = SupabaseClient<Database>;
type ProfileRow = Tables<"profiles">;
type TargetRow = Tables<"daily_targets">;
type WorkoutPlanRow = Tables<"workout_plans">;
type PlannedWorkoutRow = Tables<"planned_workouts">;
type PlannedExerciseRow = Tables<"planned_exercises">;
type MealPlanRow = Tables<"meal_plans">;
type PlannedMealRow = Tables<"planned_meals">;
type SessionRow = Tables<"workout_sessions">;
type ExerciseLogRow = Tables<"exercise_logs">;
type FoodRow = Tables<"foods">;
type FoodServingOptionRow = Tables<"food_serving_options">;
type ExerciseRow = Tables<"exercises">;
type MealRow = Tables<"meals">;
type IngredientRow = Tables<"meal_ingredients">;
type NutritionRow = Tables<"nutrition_logs">;
type WeightRow = Tables<"weight_entries">;
type GroceryListRow = Tables<"grocery_lists">;
type GroceryItemRow = Tables<"grocery_items">;
type GoalRow = Tables<"goals">;
type OverrideRow = Tables<"workout_plan_overrides">;
type ProgressionDecisionRow = Tables<"progression_decisions">;
type LoggedMealRow = Tables<"logged_meals">;

const isEquipment = (value: string): value is EquipmentId =>
  ["none", "pullup_bar", "bands", "dumbbells", "bench"].includes(value);

function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    sex: row.sex as UserProfile["sex"],
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
    units: row.units as UserProfile["units"],
    experience: row.experience as UserProfile["experience"],
    equipment: row.equipment.filter(isEquipment),
    daysPerWeek: row.days_per_week,
    sessionMinutes: row.session_minutes,
    goal: row.goal as UserProfile["goal"],
    dietaryPattern: row.dietary_pattern,
    allergies: row.allergies,
    ...(row.food_preferences ? { foodPreferences: row.food_preferences } : {}),
    ...(row.cooking_time_minutes === null ? {} : { cookingTimeMinutes: row.cooking_time_minutes }),
    ...(row.meal_budget === null ? {} : { mealBudget: Number(row.meal_budget) }),
    notificationsEnabled: row.notifications_enabled,
    revision: row.revision,
    targetEligibility: row.eligibility_status as UserProfile["targetEligibility"],
    eligibilityVersion: row.eligibility_version,
    createdAt: row.created_at,
  };
}

function mapGoal(row: GoalRow): Goal {
  return {
    id: row.app_id,
    type: row.goal_type as Goal["type"],
    ...(row.target_weight_kg === null ? {} : { targetWeightKg: Number(row.target_weight_kg) }),
    ...(row.desired_rate_kg_per_week === null ? {} : { desiredRateKgPerWeek: Number(row.desired_rate_kg_per_week) }),
    ...(row.target_date === null ? {} : { targetDate: row.target_date }),
    ...(row.weekly_workout_target === null ? {} : { weeklyWorkoutTarget: row.weekly_workout_target }),
    ...(row.skill_targets === null ? {} : { skillTargets: row.skill_targets as unknown as Record<string, number> }),
    effectiveDate: row.effective_date,
    version: row.version,
    status: row.status === "active" ? "active" : row.status === "completed" ? "completed" : "archived",
  };
}

function mapTarget(row: TargetRow): DailyTarget {
  return {
    id: row.app_id,
    version: row.version,
    effectiveDate: row.effective_date,
    calories: Number(row.calories),
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatG: Number(row.fat_g),
    bmr: Number(row.bmr),
    bmi: Number(row.bmi),
    tdee: Number(row.tdee),
    formula: row.formula,
    activityFactor: Number(row.activity_factor),
    disclaimer: row.disclaimer,
    ...(row.calculation_assumptions ? { calculationAssumptions: row.calculation_assumptions } : {}),
    calculationVersion: row.calculation_version,
    rawCalories: Number(row.raw_calories),
    goalAdjustment: Number(row.goal_adjustment),
    safetyOutcome: row.safety_outcome as DailyTarget["safetyOutcome"],
  };
}

function mapFood(row: FoodRow, servingOptions: FoodServingOptionRow[] = []): Food {
  const extended = row as FoodRow & { value_source?: string; estimate_range?: unknown };
  return {
    id: row.app_id,
    name: row.name,
    servingLabel: row.serving_label,
    servingGrams: Number(row.serving_grams),
    unit: row.serving_unit as Food["unit"],
    calories: Number(row.calories),
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatG: Number(row.fat_g),
    ...(row.fiber_g === null ? {} : { fiberG: Number(row.fiber_g) }),
    source: row.source,
    sourceVersion: row.source_version,
    valueSource: (extended.value_source as NutritionValueSource | undefined) ?? (row.is_system ? "development_catalog" : "user_provided"),
    estimated: row.estimated,
    confidence: row.confidence as Food["confidence"],
    category: row.category as Food["category"],
    preparationBasis: row.preparation_basis as PreparationBasis,
    ...(row.fdc_id ? { fdcId: row.fdc_id } : {}),
    ...(row.record_type ? { recordType: row.record_type } : {}),
    ...(row.provider_revision ? { providerRevision: row.provider_revision } : {}),
    ...(row.provider_imported_at ? { providerImportedAt: row.provider_imported_at } : {}),
    ...(row.nutrients_per_100g ? { nutrientsPer100g: row.nutrients_per_100g as Food["nutrientsPer100g"] } : {}),
    ...(servingOptions.length > 0
      ? { servingOptions: servingOptions.map((option) => ({ label: option.label, unit: option.unit, grams: Number(option.grams) })) }
      : row.serving_options ? { servingOptions: row.serving_options as unknown as Food["servingOptions"] } : {}),
  };
}

function mapExercise(row: ExerciseRow): Exercise {
  const bounds = row.progression_bounds as Partial<NonNullable<Exercise["progressionBounds"]>>;
  return {
    id: row.app_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.movement_category as Exercise["category"],
    muscles: row.muscles,
    difficulty: row.difficulty as Exercise["difficulty"],
    equipment: row.equipment.filter(isEquipment),
    measure: row.measure as Exercise["measure"],
    illustrationAlt: row.illustration_alt,
    ...(row.regression_reference ? { regression: row.regression_reference } : {}),
    ...(row.progression_reference ? { progression: row.progression_reference } : {}),
    ...(bounds ? {
      progressionBounds: {
        minSets: Number(bounds.minSets),
        maxSets: Number(bounds.maxSets),
        setStep: Number(bounds.setStep),
        minReps: Number(bounds.minReps),
        maxReps: Number(bounds.maxReps),
        repStep: Number(bounds.repStep),
        minHoldSeconds: Number(bounds.minHoldSeconds),
        maxHoldSeconds: Number(bounds.maxHoldSeconds),
        holdStep: Number(bounds.holdStep),
      },
    } : {}),
    safety: row.safety,
  };
}

function mapWorkoutPlan(
  row: WorkoutPlanRow,
  targetsByRow: Map<number, TargetRow>,
  workouts: PlannedWorkoutRow[],
  exercises: PlannedExerciseRow[],
  exercisesByRow: Map<number, ExerciseRow>,
  overrides: OverrideRow[] = [],
): WorkoutPlan {
  const target = targetsByRow.get(row.target_row_id);
  const exercisesByWorkout = new Map<number, PlannedExerciseRow[]>();
  for (const exercise of exercises) {
    const list = exercisesByWorkout.get(exercise.planned_workout_row_id) ?? [];
    list.push(exercise);
    exercisesByWorkout.set(exercise.planned_workout_row_id, list);
  }

  const mappedWorkouts: PlannedWorkout[] = workouts
    .filter((workout) => workout.plan_row_id === row.row_id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((workout) => ({
      id: workout.app_id,
      dayOfWeek: workout.day_of_week,
      title: workout.title,
      focus: workout.focus,
      warmup: workout.warmup,
      cooldown: workout.cooldown,
      estimatedMinutes: workout.estimated_minutes,
      exercises: (exercisesByWorkout.get(workout.row_id) ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((exercise, exerciseIndex): PlannedExercise => {
          const override = overrides.find((candidate) => candidate.planned_exercise_row_id === exercise.row_id && candidate.active);
          const measure = override?.measure_override ?? exercise.measure_snapshot;
          return {
            id: exercise.app_id,
            exerciseId: override?.replacement_exercise_row_id
              ? exercisesByRow.get(override.replacement_exercise_row_id)?.app_id ?? exercisesByRow.get(exercise.exercise_row_id)?.app_id ?? ""
              : exercisesByRow.get(exercise.exercise_row_id)?.app_id ?? "",
            sets: override?.sets_override ?? exercise.sets,
            ...(measure === "hold"
              ? { holdSeconds: override?.hold_seconds_override ?? exercise.hold_seconds ?? 1 }
              : { reps: override?.reps_override ?? exercise.reps ?? 1 }),
            restSeconds: override?.rest_seconds_override ?? exercise.rest_seconds,
            sortOrder: exercise.sort_order,
            slotKey: exercise.slot_key || `day:${workout.day_of_week}:exercise:${exerciseIndex + 1}`,
          };
        }),
    }));

  return {
    id: row.app_id,
    version: row.version,
    createdAt: row.created_at,
    targetId: target?.app_id ?? "",
    workouts: mappedWorkouts,
  };
}

function mapMealPlan(
  row: MealPlanRow,
  targetsByRow: Map<number, TargetRow>,
  meals: PlannedMealRow[],
  mealsByRow: Map<number, MealRow>,
  foodsByRow: Map<number, FoodRow>,
): MealPlan {
  const target = targetsByRow.get(row.target_row_id);
  return {
    id: row.app_id,
    version: row.version,
    weekOf: row.week_of,
    targetId: target?.app_id ?? "",
    meals: meals
      .filter((meal) => meal.meal_plan_row_id === row.row_id)
      .sort((a, b) => a.meal_date.localeCompare(b.meal_date) || a.meal_slot.localeCompare(b.meal_slot) || a.sort_order - b.sort_order)
      .map((meal): PlannedMeal => {
        const mealRef = meal.meal_row_id === null ? undefined : mealsByRow.get(meal.meal_row_id);
        const foodRef = meal.food_row_id === null ? undefined : foodsByRow.get(meal.food_row_id);
        return {
          id: meal.app_id,
          slotKey: meal.slot_key,
          sortOrder: meal.sort_order,
          date: meal.meal_date,
          slot: meal.meal_slot as PlannedMeal["slot"],
          ...(mealRef ? { mealId: mealRef.app_id } : {}),
          ...(foodRef ? { foodId: foodRef.app_id } : {}),
          label: meal.label,
          servings: Number(meal.servings),
          ...(meal.skipped ? { skipped: true } : {}),
          ...(meal.expected_calories === null ? {} : { expectedCalories: Number(meal.expected_calories) }),
          ...(meal.expected_protein_g === null ? {} : { expectedProteinG: Number(meal.expected_protein_g) }),
          ...(meal.expected_carbs_g === null ? {} : { expectedCarbsG: Number(meal.expected_carbs_g) }),
          ...(meal.expected_fat_g === null ? {} : { expectedFatG: Number(meal.expected_fat_g) }),
          ...(meal.expected_fiber_g === null ? {} : { expectedFiberG: Number(meal.expected_fiber_g) }),
          ...(meal.source ? { source: meal.source } : {}),
          ...(meal.source_version ? { sourceVersion: meal.source_version } : {}),
          ...(meal.assumptions ? { assumptions: meal.assumptions } : {}),
          ...(meal.confidence ? { confidence: meal.confidence as PlannedMeal["confidence"] } : {}),
          ...(meal.preparation_basis ? { preparationBasis: meal.preparation_basis as PreparationBasis } : {}),
        };
      }),
  };
}

function mapSession(
  row: SessionRow,
  workoutsByRow: Map<number, PlannedWorkoutRow>,
  logsBySession: Map<number, ExerciseLogRow[]>,
  exercisesByRow: Map<number, ExerciseRow>,
): WorkoutSession {
  const workout = workoutsByRow.get(row.planned_workout_row_id);
  return {
    id: row.app_id,
    plannedWorkoutId: workout?.app_id ?? "",
    plannedPlanVersion: row.planned_plan_version,
    date: row.session_date,
    startedAt: row.started_at,
    ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
    status: row.status as WorkoutSession["status"],
    logs: (logsBySession.get(row.row_id) ?? []).map((log): ExerciseLog => ({
      exerciseId: exercisesByRow.get(log.actual_exercise_row_id)?.app_id ?? "",
      plannedExerciseId: log.planned_exercise_app_id,
      planned: {
        sets: log.planned_sets,
        ...(log.planned_reps === null ? {} : { reps: log.planned_reps }),
        ...(log.planned_hold_seconds === null ? {} : { holdSeconds: log.planned_hold_seconds }),
      },
      actual: {
        sets: log.actual_sets ?? 0,
        ...(log.actual_reps === null ? {} : { reps: log.actual_reps }),
        ...(log.actual_hold_seconds === null ? {} : { holdSeconds: log.actual_hold_seconds }),
        ...(log.actual_load === null ? {} : { load: Number(log.actual_load) }),
        ...(log.actual_load_unit === null ? {} : { loadUnit: log.actual_load_unit as "kg" | "lb" }),
      },
      status: log.status as ExerciseLog["status"],
      ...(log.rpe === null ? {} : { rpe: log.rpe }),
      ...(log.manageable === null ? {} : { manageable: log.manageable }),
      ...(log.pain === null ? {} : { pain: log.pain }),
      ...(log.note === null ? {} : { note: log.note }),
    })),
  };
}

function mapNutrition(row: NutritionRow, foodsByRow: Map<number, FoodRow>, loggedMealsByRow: Map<number, LoggedMealRow>): NutritionLog {
  const food = row.food_row_id === null ? undefined : foodsByRow.get(row.food_row_id);
  return {
    id: row.app_id,
    date: row.log_date,
    slot: row.meal_slot as NutritionLog["slot"],
    ...(food ? { foodId: food.app_id } : {}),
    ...(row.custom_name ? { customName: row.custom_name } : {}),
    servings: Number(row.servings),
    servingQuantity: Number(row.serving_quantity),
    servingUnit: row.serving_unit as NutritionLog["servingUnit"],
    calories: Number(row.calories),
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatG: Number(row.fat_g),
    estimated: row.estimated,
    confidence: row.confidence as NutritionLog["confidence"],
    source: row.source,
    valueSource: row.value_source as NutritionValueSource,
    ...(row.source_version ? { sourceVersion: row.source_version } : {}),
    ...(row.preparation_basis ? { preparationBasis: row.preparation_basis as PreparationBasis } : {}),
    ...(row.fiber_g === null ? {} : { fiberG: Number(row.fiber_g) }),
    ...(row.assumptions ? { assumptions: row.assumptions } : {}),
    ...(row.estimate_range ? { estimateRange: row.estimate_range as unknown as MacroEstimateRange } : {}),
    ...(row.logged_meal_row_id === null ? {} : { loggedMealId: loggedMealsByRow.get(row.logged_meal_row_id)?.app_id }),
    ...(row.ingredient_order === null ? {} : { ingredientOrder: row.ingredient_order }),
    revision: row.revision,
    createdAt: row.created_at,
  };
}

function mapGrocery(row: GroceryListRow, items: GroceryItemRow[]): AppSnapshot["grocery"] {
  return {
    id: row.app_id,
    weekOf: row.week_of,
    revision: row.revision,
    items: items
      .filter((item) => item.grocery_list_row_id === row.row_id)
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map(
        (item): GroceryItem => ({
          id: item.app_id,
          name: item.name,
          category: item.category as GroceryItem["category"],
          unit: item.unit,
          generatedQuantity: Number(item.generated_quantity),
          quantity: Number(item.quantity),
          checked: item.checked,
          ...(item.custom_item ? { custom: true } : {}),
          ...(item.removed ? { removed: true } : {}),
        }),
      ),
  };
}

function mapMeal(
  row: MealRow,
  ingredientsByMeal: Map<number, IngredientRow[]>,
  foodsByRow: Map<number, FoodRow>,
): Meal {
  return {
    id: row.app_id,
    name: row.name,
    servings: Number(row.servings),
    ...(row.is_system ? { isSystem: true } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    revision: row.revision,
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
    ingredients: (ingredientsByMeal.get(row.row_id) ?? [])
      .sort((a, b) => a.ingredient_order - b.ingredient_order)
      .flatMap((ingredient) => {
        const food = foodsByRow.get(ingredient.food_row_id);
        return food ? [{ foodId: food.app_id, servings: Number(ingredient.servings) }] : [];
      }),
  };
}

function emptySnapshot(userId: string): AppSnapshot {
  return {
    schemaVersion: 1,
    userId,
    onboarded: false,
    profile: null,
    foods: [],
    goal: null,
    target: null,
    plan: null,
    workoutOverrides: [],
    mealPlan: null,
    sessions: [],
    nutritionLogs: [],
    loggedMeals: [],
    weights: [],
    grocery: null,
    savedMeals: [],
    progressionDecisions: [],
  };
}

function mapProgressionDecision(row: ProgressionDecisionRow): ProgressionDecision {
  return {
    id: row.app_id,
    slotKey: row.slot_key,
    plannedExerciseId: row.planned_exercise_app_id,
    action: row.action as ProgressionDecision["action"],
    decision: row.decision as ProgressionDecision["decision"],
    ruleVersion: row.rule_version,
    sourceSessionIds: row.source_session_ids,
    ...(row.proposed_replacement_exercise_id ? { proposedReplacementExerciseId: row.proposed_replacement_exercise_id } : {}),
    ...(row.proposed_sets === null ? {} : { proposedSets: row.proposed_sets }),
    ...(row.proposed_reps === null ? {} : { proposedReps: row.proposed_reps }),
    ...(row.proposed_hold_seconds === null ? {} : { proposedHoldSeconds: row.proposed_hold_seconds }),
    createdAt: row.created_at,
  };
}

async function required<T>(
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function loadAppSnapshot(
  client: AppSupabaseClient,
  userId: string,
): Promise<AppSnapshot> {
  const profile = await required(
    client.from("profiles").select("*").eq("id", userId).maybeSingle(),
  );
  const targets = await required(
    client.from("daily_targets").select("*").eq("user_id", userId).order("version", { ascending: false }),
  );
  const targetRows = targets as TargetRow[];
  const targetsByRow = new Map(targetRows.map((row) => [row.row_id, row]));
  const currentTarget = targetRows[0] ? mapTarget(targetRows[0]) : null;

  const historyFrom = addDays(todayKey(), -365);
  const [exercises, foods, meals, ingredients, workoutPlans, mealPlans, sessions, nutrition, weights, groceryLists, groceryItems, goals, overrides, progressionDecisions, servingOptions, loggedMeals] =
    await Promise.all([
      required(client.from("exercises").select("*")),
      required(client.from("foods").select("*")),
      required(client.from("meals").select("*").or(`is_system.eq.true,owner_user_id.eq.${userId}`)),
      required(client.from("meal_ingredients").select("*")),
      required(client.from("workout_plans").select("*").eq("user_id", userId).order("created_at", { ascending: false })),
      required(client.from("meal_plans").select("*").eq("user_id", userId).order("created_at", { ascending: false })),
      required(client.from("workout_sessions").select("*").eq("user_id", userId).gte("session_date", historyFrom).order("session_date", { ascending: false }).limit(100)),
      required(client.from("nutrition_logs").select("*").eq("user_id", userId).gte("log_date", historyFrom).order("log_date", { ascending: false }).limit(100)),
      required(client.from("weight_entries").select("*").eq("user_id", userId).gte("entry_date", historyFrom).order("entry_date", { ascending: false }).limit(100)),
      required(client.from("grocery_lists").select("*").eq("user_id", userId).order("week_of", { ascending: false })),
      required(client.from("grocery_items").select("*").eq("user_id", userId)),
      required(client.from("goals").select("*").eq("user_id", userId).order("version", { ascending: false })),
      required(client.from("workout_plan_overrides").select("*").eq("user_id", userId).eq("active", true)),
      required(client.from("progression_decisions").select("*").eq("user_id", userId).order("created_at", { ascending: false })),
      required(client.from("food_serving_options").select("*")),
      required(client.from("logged_meals").select("*").eq("user_id", userId).gte("log_date", historyFrom).order("log_date", { ascending: false })),
    ]);

  const exerciseRows = exercises as ExerciseRow[];
  const foodRows = foods as FoodRow[];
  const mealRows = meals as MealRow[];
  const ingredientRows = ingredients as IngredientRow[];
  const planRows = workoutPlans as WorkoutPlanRow[];
  const mealPlanRows = mealPlans as MealPlanRow[];
  const sessionRows = sessions as SessionRow[];
  const nutritionRows = nutrition as NutritionRow[];
  const weightRows = weights as WeightRow[];
  const groceryListRows = groceryLists as GroceryListRow[];
  const groceryItemRows = groceryItems as GroceryItemRow[];
  const goalRows = goals as GoalRow[];
  const overrideRows = overrides as OverrideRow[];
  const progressionDecisionRows = progressionDecisions as ProgressionDecisionRow[];
  const servingOptionRows = servingOptions as FoodServingOptionRow[];
  const loggedMealRows = loggedMeals as LoggedMealRow[];
  const loggedMealsByRow = new Map(loggedMealRows.map((row) => [row.row_id, row]));
  const servingOptionsByFood = new Map<number, FoodServingOptionRow[]>();
  for (const option of servingOptionRows) {
    const list = servingOptionsByFood.get(option.food_row_id) ?? [];
    list.push(option);
    servingOptionsByFood.set(option.food_row_id, list);
  }
  const mealsByRow = new Map(mealRows.map((row) => [row.row_id, row]));
  const exercisesByRow = new Map(exerciseRows.map((row) => [row.row_id, row]));
  const foodsByRow = new Map(foodRows.map((row) => [row.row_id, row]));
  const currentPlan = planRows[0];
  const currentMealPlan = mealPlanRows[0];
  const plannedWorkouts = planRows.length
    ? await required(client.from("planned_workouts").select("*").eq("user_id", userId))
    : [];
  const plannedWorkoutRows = plannedWorkouts as PlannedWorkoutRow[];
  const plannedExercises = plannedWorkoutRows.length
    ? await required(
        client
          .from("planned_exercises")
          .select("*")
          .eq("user_id", userId)
          .in("planned_workout_row_id", plannedWorkoutRows.map((row) => row.row_id)),
      )
    : [];
  const plannedExercisesByRow = new Map((plannedExercises as PlannedExerciseRow[]).map((row) => [row.row_id, row]));
  const sessionLogs = sessionRows.length
    ? await required(
        client
          .from("exercise_logs")
          .select("*")
          .eq("user_id", userId)
          .in("session_row_id", sessionRows.map((row) => row.row_id)),
      )
    : [];

  const workoutsByRow = new Map(plannedWorkoutRows.map((row) => [row.row_id, row]));
  const logsBySession = new Map<number, ExerciseLogRow[]>();
  for (const log of sessionLogs as ExerciseLogRow[]) {
    const list = logsBySession.get(log.session_row_id) ?? [];
    list.push(log);
    logsBySession.set(log.session_row_id, list);
  }
  const ingredientsByMeal = new Map<number, IngredientRow[]>();
  for (const ingredient of ingredientRows) {
    const list = ingredientsByMeal.get(ingredient.meal_row_id) ?? [];
    list.push(ingredient);
    ingredientsByMeal.set(ingredient.meal_row_id, list);
  }

  const snapshot = emptySnapshot(userId);
  snapshot.profile = profile ? mapProfile(profile as ProfileRow) : null;
  snapshot.foods = foodRows.map((row) => mapFood(row, servingOptionsByFood.get(row.row_id)));
  snapshot.onboarded = Boolean(snapshot.profile);
  snapshot.goal = goalRows[0] ? mapGoal(goalRows[0]) : null;
  // Unsupported screening outcomes may retain historical target rows for
  // audit/export, but they are not surfaced as an active automated target.
  snapshot.target = snapshot.profile?.targetEligibility === "unsupported" ? null : currentTarget;
  snapshot.plan = currentPlan
    ? mapWorkoutPlan(
        currentPlan,
        targetsByRow,
        plannedWorkoutRows,
        plannedExercises as PlannedExerciseRow[],
        exercisesByRow,
        overrideRows,
      )
    : null;
  snapshot.mealPlan = currentMealPlan
    ? mapMealPlan(
        currentMealPlan,
        targetsByRow,
        (await required(
          client.from("planned_meals").select("*").eq("meal_plan_row_id", currentMealPlan.row_id),
        )) as PlannedMealRow[],
        mealsByRow,
        foodsByRow,
      )
    : null;
  snapshot.sessions = sessionRows.map((row) =>
    mapSession(row, workoutsByRow, logsBySession, exercisesByRow),
  );
  snapshot.workoutOverrides = overrideRows.map((row): WorkoutPlanOverride => ({
    id: row.app_id,
    slotKey: row.slot_key,
    plannedExerciseId: plannedExercisesByRow.get(row.planned_exercise_row_id)?.app_id,
    ...(row.replacement_exercise_row_id ? { replacementExerciseId: exercisesByRow.get(row.replacement_exercise_row_id)?.app_id } : {}),
    ...(row.measure_override ? { measure: row.measure_override as WorkoutPlanOverride["measure"] } : {}),
    ...(row.sets_override === null ? {} : { sets: row.sets_override }),
    ...(row.reps_override === null ? {} : { reps: row.reps_override }),
    ...(row.hold_seconds_override === null ? {} : { holdSeconds: row.hold_seconds_override }),
    ...(row.rest_seconds_override === null ? {} : { restSeconds: row.rest_seconds_override }),
    active: row.active,
    effectiveAt: row.effective_at,
    ...(row.ended_at ? { endedAt: row.ended_at } : {}),
  }));
  snapshot.progressionDecisions = progressionDecisionRows.map(mapProgressionDecision);
  snapshot.loggedMeals = loggedMealRows.map((row): LoggedMeal => ({
    id: row.app_id,
    date: row.log_date,
    slot: row.meal_slot as LoggedMeal["slot"],
    name: row.name,
    mealId: mealsByRow.get(row.meal_row_id)?.app_id ?? "",
    sourceMode: row.source_mode as LoggedMeal["sourceMode"],
    ...(row.assumptions ? { assumptions: row.assumptions } : {}),
    revision: row.revision,
    createdAt: row.created_at,
  }));
  snapshot.nutritionLogs = nutritionRows.map((row) => mapNutrition(row, foodsByRow, loggedMealsByRow));
  snapshot.weights = weightRows.map((row) => ({
    id: row.app_id,
    date: row.entry_date,
    weightKg: Number(row.weight_kg),
  }));
  snapshot.grocery = groceryListRows[0]
    ? mapGrocery(groceryListRows[0], groceryItemRows)
    : null;
  snapshot.savedMeals = mealRows
    .filter((row) => (row.is_system || row.owner_user_id === userId) && !row.archived_at)
    .map((row) => mapMeal(row, ingredientsByMeal, foodsByRow));

  return snapshot;
}

/**
 * Bounded history read model for progress/history surfaces. The main app
 * snapshot remains the current-plan read model; older history is fetched by
 * date range and independent cursors so it cannot grow without bound.
 */
export async function loadHistoryReadModel(
  client: AppSupabaseClient,
  userId: string,
  query: HistoryQuery = {},
): Promise<HistoryReadModel> {
  const to = query.to ?? todayKey();
  const from = query.from ?? addDays(to, -365);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(from) || !datePattern.test(to) || from > to) {
    throw new Error("History date range is invalid.");
  }
  const rangeDays = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  if (!Number.isFinite(rangeDays) || rangeDays > 366) {
    throw new Error("History date range cannot exceed 366 days.");
  }
  const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 50)));

  const sessionsQuery = client
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .gte("session_date", from)
    .lte("session_date", to)
    .order("started_at", { ascending: false })
    .order("row_id", { ascending: false })
    .limit(limit + 1);
  if (query.sessionsCursor) {
    const [timestamp, rowId] = query.sessionsCursor.split("|");
    if (timestamp && rowId && /^\d+$/.test(rowId)) {
      sessionsQuery.or(`started_at.lt.${timestamp},and(started_at.eq.${timestamp},row_id.lt.${rowId})`);
    }
  }

  const nutritionQuery = client
    .from("nutrition_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("log_date", from)
    .lte("log_date", to)
    .order("created_at", { ascending: false })
    .order("row_id", { ascending: false })
    .limit(limit + 1);
  if (query.nutritionCursor) {
    const [timestamp, rowId] = query.nutritionCursor.split("|");
    if (timestamp && rowId && /^\d+$/.test(rowId)) {
      nutritionQuery.or(`created_at.lt.${timestamp},and(created_at.eq.${timestamp},row_id.lt.${rowId})`);
    }
  }

  const weightsQuery = client
    .from("weight_entries")
    .select("*")
    .eq("user_id", userId)
    .gte("entry_date", from)
    .lte("entry_date", to)
    .order("entry_date", { ascending: false })
    .order("row_id", { ascending: false })
    .limit(limit + 1);
  if (query.weightsCursor) {
    const [date, rowId] = query.weightsCursor.split("|");
    if (date && rowId && /^\d+$/.test(rowId)) {
      weightsQuery.or(`entry_date.lt.${date},and(entry_date.eq.${date},row_id.lt.${rowId})`);
    }
  }

  const [sessionResult, nutritionResult, weightResult] = await Promise.all([
    required(sessionsQuery),
    required(nutritionQuery),
    required(weightsQuery),
  ]);
  const sessionRows = sessionResult as SessionRow[];
  const nutritionRows = nutritionResult as NutritionRow[];
  const weightRows = weightResult as WeightRow[];
  const visibleSessions = sessionRows.slice(0, limit);
  const visibleNutrition = nutritionRows.slice(0, limit);
  const visibleWeights = weightRows.slice(0, limit);

  const [plannedWorkouts, sessionLogs, foods, scheduledWorkouts] = await Promise.all([
    visibleSessions.length
      ? required(client.from("planned_workouts").select("*").eq("user_id", userId).in("row_id", visibleSessions.map((row) => row.planned_workout_row_id)))
      : Promise.resolve([] as PlannedWorkoutRow[]),
    visibleSessions.length
      ? required(client.from("exercise_logs").select("*").eq("user_id", userId).in("session_row_id", visibleSessions.map((row) => row.row_id)))
      : Promise.resolve([] as ExerciseLogRow[]),
    visibleNutrition.length
      ? required(client.from("foods").select("*").in("row_id", visibleNutrition.flatMap((row) => row.food_row_id === null ? [] : [row.food_row_id])))
      : Promise.resolve([] as FoodRow[]),
    required(client.from("planned_workouts").select("day_of_week").eq("user_id", userId)),
  ]);
  const workoutsByRow = new Map((plannedWorkouts as PlannedWorkoutRow[]).map((row) => [row.row_id, row]));
  const logsBySession = new Map<number, ExerciseLogRow[]>();
  for (const log of sessionLogs as ExerciseLogRow[]) {
    const list = logsBySession.get(log.session_row_id) ?? [];
    list.push(log);
    logsBySession.set(log.session_row_id, list);
  }
  const foodsByRow = new Map((foods as FoodRow[]).map((row) => [row.row_id, row]));

  const dateCount = rangeDays;
  const nutritionDays = new Map<string, Set<string>>();
  for (const row of visibleNutrition) {
    const slots = nutritionDays.get(row.log_date) ?? new Set<string>();
    slots.add(row.meal_slot);
    nutritionDays.set(row.log_date, slots);
  }
  const scheduledDays = new Set((scheduledWorkouts as Array<{ day_of_week: number }>).map((row) => row.day_of_week));
  let scheduledWorkoutDays = 0;
  for (let offset = 0; offset < dateCount; offset += 1) {
    const date = addDays(from, offset);
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (scheduledDays.has(dayOfWeek)) {
      scheduledWorkoutDays += 1;
    }
  }
  const completeNutritionDays = [...nutritionDays.values()].filter((slots) => slots.size >= 4).length;
  const partialNutritionDays = [...nutritionDays.values()].filter((slots) => slots.size > 0 && slots.size < 4).length;
  const completedWorkoutDays = new Set(visibleSessions.filter((row) => row.status === "completed").map((row) => row.session_date)).size;
  const partialWorkoutDays = new Set(visibleSessions.filter((row) => row.status === "partial" || row.status === "in_progress").map((row) => row.session_date)).size;
  const skippedWorkoutDays = new Set(visibleSessions.filter((row) => row.status === "abandoned").map((row) => row.session_date)).size;
  return {
    sessions: visibleSessions.map((row) => {
      const logs = logsBySession.get(row.row_id) ?? [];
      const workout = workoutsByRow.get(row.planned_workout_row_id);
      return {
        id: row.app_id,
        plannedWorkoutId: workout?.app_id ?? "",
        date: row.session_date,
        startedAt: row.started_at,
        ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
        status: row.status as HistoryReadModel["sessions"][number]["status"],
        loggedExerciseCount: logs.length,
        completedExerciseCount: logs.filter((log) => log.status === "completed").length,
      };
    }),
    nutritionLogs: visibleNutrition.map((row) => mapNutrition(row, foodsByRow, new Map())),
    weights: visibleWeights.map((row) => ({ id: row.app_id, date: row.entry_date, weightKg: Number(row.weight_kg) })),
    summary: {
      rangeFrom: from,
      rangeTo: to,
      scheduledWorkoutDays,
      completedWorkoutDays,
      partialWorkoutDays,
      skippedWorkoutDays,
      nutritionLoggedDays: nutritionDays.size,
      nutritionCompleteDays: completeNutritionDays,
      nutritionPartialDays: partialNutritionDays,
      nutritionUnloggedDays: Math.max(0, dateCount - nutritionDays.size),
    },
    nextCursors: {
      ...(sessionRows.length > limit && visibleSessions.at(-1) ? { sessions: `${visibleSessions.at(-1)!.started_at}|${visibleSessions.at(-1)!.row_id}` } : {}),
      ...(nutritionRows.length > limit && visibleNutrition.at(-1) ? { nutrition: `${visibleNutrition.at(-1)!.created_at}|${visibleNutrition.at(-1)!.row_id}` } : {}),
      ...(weightRows.length > limit && visibleWeights.at(-1) ? { weights: `${visibleWeights.at(-1)!.entry_date}|${visibleWeights.at(-1)!.row_id}` } : {}),
    },
  };
}

export { mapFood, mapExercise };
