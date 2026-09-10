import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const EXPECTED_RPCS = [
  "complete_onboarding",
  "update_profile",
  "update_units",
  "reset_plan",
  "skip_planned_meal",
  "start_workout_session",
  "save_workout_session",
  "finish_workout_session",
  "abandon_workout_session",
  "save_nutrition_log",
  "delete_nutrition_log",
  "save_weight_entry",
  "save_saved_meal",
  "save_recipe",
  "toggle_grocery_item",
  "set_grocery_quantity",
  "remove_grocery_item",
  "add_custom_grocery_item",
  "regenerate_grocery",
  "export_account_data",
  "delete_account",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertError(result, context, expectedCode = null) {
  assert(result?.error, `${context}: expected an error`);
  if (expectedCode && result.error.code !== expectedCode) {
    throw new Error(
      `${context}: expected ${expectedCode}, received ${result.error.code ?? "unknown"}`
    );
  }
  return result.error;
}

function assertOk(result, context) {
  if (result?.error) {
    const code = result.error.code ? ` (${result.error.code})` : "";
    throw new Error(`${context}${code}: ${result.error.message}`);
  }
  return result;
}

function clientFor(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function rawRpc(client, name, payload, calls) {
  calls.add(name);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await client.rpc(name, { p_payload: payload });
    if (!result.error || result.error.code !== "PGRST303" || attempt === 3) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    await client.auth.refreshSession();
  }

  throw new Error("Supabase RPC retry budget exhausted");
}

async function rpc(client, name, payload, context, calls) {
  const result = await rawRpc(client, name, payload, calls);
  assertOk(result, context);
  assert(result.data, `${context}: RPC returned no data`);
  const expectedOperation = name === "save_recipe" ? "save_saved_meal" : name;
  assert(
    result.data.operation === expectedOperation,
    `${context}: expected operation ${expectedOperation}, received ${result.data.operation ?? "none"}`
  );
  assert(result.data.result_refs, `${context}: RPC returned no result references`);
  return result.data;
}

async function countRows(client, table, column, value, context) {
  const result = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  assertOk(result, context);
  return result.count ?? 0;
}

async function selectOne(client, table, columns, column, value, context) {
  const result = await client
    .from(table)
    .select(columns)
    .eq(column, value)
    .single();
  assertOk(result, context);
  return result.data;
}

function bundle(prefix, options = {}) {
  const {
    units = "metric",
    name = "RPC Smoke User",
    effectiveDate = "2026-09-07",
    mealSkipped = false,
    planId = `${prefix}-plan`,
    mealPlanId = `${prefix}-meal-plan`,
  } = options;

  return {
    profile: {
      name,
      age: 30,
      sex: "female",
      heightCm: 165,
      weightKg: 65,
      units,
      experience: "beginner",
      equipment: ["none"],
      daysPerWeek: 3,
      sessionMinutes: 30,
      goal: "maintain",
      dietaryPattern: "",
      allergies: [],
      foodPreferences: [],
    },
    target: {
      id: `${prefix}-target`,
      effectiveDate,
      calories: 2000,
      proteinG: 120,
      carbsG: 220,
      fatG: 60,
      bmr: 1400,
      bmi: 24,
      tdee: 2000,
      activityFactor: 1.5,
      formula: "rpc-smoke",
      calculationAssumptions: "fixture",
      disclaimer: "Test estimates only.",
    },
    plan: {
      id: planId,
      workouts: [
        {
          id: `${prefix}-workout`,
          dayOfWeek: 1,
          title: `${name} workout`,
          focus: "Full body",
          warmup: [],
          cooldown: [],
          estimatedMinutes: 30,
          sortOrder: 1,
          exercises: [
            {
              id: `${prefix}-exercise`,
              exerciseId: "ex-knee-push-up",
              sortOrder: 1,
              sets: 3,
              reps: 8,
              restSeconds: 60,
            },
          ],
        },
      ],
    },
    mealPlan: {
      id: mealPlanId,
      weekOf: "2026-09-07",
      meals: [
        {
          id: `${prefix}-planned-meal`,
          date: effectiveDate,
          slot: "breakfast",
          foodId: "food-egg",
          label: "Smoke-test breakfast",
          servings: 1,
          expectedCalories: 72,
          expectedProteinG: 6.3,
          expectedCarbsG: 0.4,
          expectedFatG: 4.8,
          expectedFiberG: 0,
          source: "Starter Food Catalog",
          sourceVersion: "2026.09",
          assumptions: "fixture",
          confidence: "high",
          preparationBasis: "as_labeled",
          skipped: mealSkipped,
        },
      ],
    },
    grocery: {
      id: `${prefix}-grocery`,
      weekOf: "2026-09-07",
      items: [
        {
          id: `${prefix}-grocery-item`,
          name: "Egg",
          category: "Protein",
          unit: "piece",
          generatedQuantity: 2,
          quantity: 2,
          checked: false,
          custom: false,
          removed: false,
          foodId: "food-egg",
        },
      ],
    },
    effectiveDate,
    goalId: `${prefix}-goal`,
  };
}

async function deleteSession(session, label, calls) {
  if (!session || session.deleted) return;

  const result = await rawRpc(
    session.client,
    "delete_account",
    { idempotencyKey: `rpc-smoke-cleanup-${label}-${randomUUID()}` },
    calls
  );
  assertOk(result, `${label} cleanup failed`);
  assert(result.data?.clear_cache === true, `${label} cleanup did not return clear_cache`);
  session.deleted = true;
}

export async function runRpcSmoke({ url, key, createSession, label = "local" }) {
  const calls = new Set();
  const runId = randomUUID().slice(0, 8);
  const id = (suffix) => `rpc-smoke-${runId}-${suffix}`;
  let userA;
  let userB;

  try {
    [userA, userB] = await Promise.all([
      createSession("a", url, key),
      createSession("b", url, key),
    ]);

    const baseA = bundle(id("a"));
    const baseB = bundle(id("b"), { name: "RPC Smoke User B" });

    const onboardingA = {
      ...baseA,
      idempotencyKey: id("onboarding-a"),
    };
    const onboardingResult = await rpc(
      userA.client,
      "complete_onboarding",
      onboardingA,
      `${label} onboarding A`,
      calls
    );
    assert(onboardingResult.result_refs?.profile_id === userA.userId, `${label} onboarding did not bind auth owner`);

    const onboardingReplay = await rpc(
      userA.client,
      "complete_onboarding",
      onboardingA,
      `${label} onboarding replay A`,
      calls
    );
    assert(onboardingReplay.replayed === true, `${label} onboarding replay was not marked replayed`);

    const mismatch = await rawRpc(
      userA.client,
      "complete_onboarding",
      { ...onboardingA, different: true },
      calls
    );
    assertError(mismatch, `${label} onboarding hash mismatch`, "P0001");

    const invalid = bundle(id("invalid"));
    invalid.plan.workouts[0].exercises[0].exerciseId = "missing-exercise";
    const invalidResult = await rawRpc(
      userA.client,
      "complete_onboarding",
      { ...invalid, idempotencyKey: id("invalid-onboarding") },
      calls
    );
    assertError(invalidResult, `${label} invalid onboarding`, "P0001");
    assert(
      (await countRows(userA.client, "workout_plans", "app_id", invalid.plan.id, `${label} invalid plan rollback`)) === 0,
      `${label} invalid onboarding left a partial plan`
    );

    await rpc(
      userB.client,
      "complete_onboarding",
      { ...baseB, idempotencyKey: id("onboarding-b") },
      `${label} onboarding B`,
      calls
    );

    const profileUpdate = bundle(id("profile"), {
      name: "RPC Smoke Updated",
      effectiveDate: "2026-09-08",
      planId: baseA.plan.id,
      mealPlanId: id("profile-meal-plan"),
    });
    await rpc(
      userA.client,
      "update_profile",
      { ...profileUpdate, idempotencyKey: id("update-profile") },
      `${label} profile update`,
      calls
    );

    const unitsUpdate = bundle(id("units"), {
      units: "imperial",
      name: "RPC Smoke Imperial",
      effectiveDate: "2026-09-09",
    });
    await rpc(
      userA.client,
      "update_units",
      { ...unitsUpdate, idempotencyKey: id("update-units") },
      `${label} unit update`,
      calls
    );
    const profileAfterUnits = await selectOne(
      userA.client,
      "profiles",
      "units",
      "id",
      userA.userId,
      `${label} profile after units`
    );
    assert(profileAfterUnits.units === "imperial", `${label} update_units did not persist imperial units`);

    const resetPlan = bundle(id("reset"), {
      units: "imperial",
      name: "RPC Smoke Reset",
      effectiveDate: "2026-09-10",
    });
    await rpc(
      userA.client,
      "reset_plan",
      { ...resetPlan, idempotencyKey: id("reset-plan") },
      `${label} reset plan`,
      calls
    );
    assert(
      (await countRows(userA.client, "workout_plans", "user_id", userA.userId, `${label} plan history`)) >= 4,
      `${label} reset plan did not preserve earlier plan versions`
    );

    const skippedPlan = bundle(id("skip"), {
      units: "imperial",
      name: "RPC Smoke Skip",
      effectiveDate: "2026-09-10",
      mealSkipped: true,
      planId: baseA.plan.id,
      mealPlanId: baseA.mealPlan.id,
    });
    await rpc(
      userA.client,
      "skip_planned_meal",
      { ...skippedPlan, idempotencyKey: id("skip-meal") },
      `${label} skip planned meal`,
      calls
    );
    const skippedMeal = await selectOne(
      userA.client,
      "planned_meals",
      "skipped",
      "app_id",
      skippedPlan.mealPlan.meals[0].id,
      `${label} skipped meal`
    );
    assert(skippedMeal.skipped === true, `${label} skip_planned_meal did not persist skipped state`);
    const originalMeal = await selectOne(
      userA.client,
      "planned_meals",
      "skipped",
      "app_id",
      baseA.mealPlan.meals[0].id,
      `${label} original meal`
    );
    assert(originalMeal.skipped === false, `${label} skip_planned_meal changed the original plan`);

    const plannedWorkoutId = skippedPlan.plan.workouts[0].id;
    const plannedExerciseId = skippedPlan.plan.workouts[0].exercises[0].id;
    const sessionId = id("session");
    const startPayload = {
      session: {
        id: sessionId,
        plannedWorkoutId,
        date: "2026-09-10",
        startedAt: "2026-09-10T08:00:00Z",
      },
      idempotencyKey: id("start-session"),
    };
    await rpc(userA.client, "start_workout_session", startPayload, `${label} start workout`, calls);
    const startReplay = await rpc(userA.client, "start_workout_session", startPayload, `${label} start replay`, calls);
    assert(startReplay.replayed === true, `${label} start replay was not marked replayed`);

    const logs = [
      {
        plannedExerciseId,
        actualExerciseId: "ex-push-up",
        status: "completed",
        actual: { sets: 3, reps: 6 },
        rpe: 6,
        manageable: true,
        pain: false,
        note: "substituted",
      },
    ];
    const saveSessionPayload = {
      session: { id: sessionId, logs },
      idempotencyKey: id("save-session"),
    };
    await rpc(userA.client, "save_workout_session", saveSessionPayload, `${label} save workout`, calls);
    const savedLog = await selectOne(
      userA.client,
      "exercise_logs",
      "actual_exercise_row_id, planned_sets, actual_sets, planned_reps, actual_reps",
      "user_id",
      userA.userId,
      `${label} saved exercise log`
    );
    assert(savedLog.actual_exercise_id !== null, `${label} workout substitution was not stored`);
    assert(
      savedLog.planned_sets !== savedLog.actual_sets || savedLog.planned_reps !== savedLog.actual_reps,
      `${label} planned and actual exercise values were merged`
    );

    const finishPayload = {
      session: { id: sessionId, finishedAt: "2026-09-10T08:30:00Z", logs },
      idempotencyKey: id("finish-session"),
    };
    await rpc(userA.client, "finish_workout_session", finishPayload, `${label} finish workout`, calls);
    const finishedSession = await selectOne(
      userA.client,
      "workout_sessions",
      "status",
      "app_id",
      sessionId,
      `${label} finished session`
    );
    assert(finishedSession.status === "completed", `${label} workout did not finish as completed`);
    const finishReplay = await rpc(userA.client, "finish_workout_session", finishPayload, `${label} finish replay`, calls);
    assert(finishReplay.replayed === true, `${label} finish replay was not marked replayed`);
    const finishAgain = await rawRpc(
      userA.client,
      "finish_workout_session",
      { ...finishPayload, idempotencyKey: id("finish-again") },
      calls
    );
    assertError(finishAgain, `${label} finish completed session again`, "P0001");

    const abandonedSessionId = id("abandoned-session");
    await rpc(
      userA.client,
      "start_workout_session",
      {
        session: { id: abandonedSessionId, plannedWorkoutId, date: "2026-09-09", startedAt: "2026-09-09T08:00:00Z" },
        idempotencyKey: id("start-abandoned"),
      },
      `${label} start abandoned workout`,
      calls
    );
    const abandonPayload = {
      session: { id: abandonedSessionId },
      idempotencyKey: id("abandon-session"),
    };
    await rpc(userA.client, "abandon_workout_session", abandonPayload, `${label} abandon workout`, calls);
    const abandonedSession = await selectOne(
      userA.client,
      "workout_sessions",
      "status",
      "app_id",
      abandonedSessionId,
      `${label} abandoned session`
    );
    assert(abandonedSession.status === "abandoned", `${label} abandon did not persist abandoned status`);
    const abandonReplay = await rpc(userA.client, "abandon_workout_session", abandonPayload, `${label} abandon replay`, calls);
    assert(abandonReplay.replayed === true, `${label} abandon replay was not marked replayed`);

    const nutritionPayload = {
      entry: {
        id: id("nutrition"),
        date: "2026-09-10",
        slot: "lunch",
        foodId: "food-egg",
        servings: 2,
        servingQuantity: 2,
        servingUnit: "piece",
        calories: 144,
        proteinG: 12.6,
        carbsG: 0.8,
        fatG: 9.6,
        fiberG: 0,
        estimated: true,
        confidence: "high",
        source: "Starter Food Catalog",
        sourceVersion: "2026.09",
        preparationBasis: "as_labeled",
        assumptions: "fixture",
      },
      idempotencyKey: id("nutrition"),
    };
    await rpc(userA.client, "save_nutrition_log", nutritionPayload, `${label} save nutrition`, calls);
    const nutritionRow = await selectOne(
      userA.client,
      "nutrition_logs",
      "source, source_version, serving_quantity, serving_unit, confidence, preparation_basis, estimated",
      "app_id",
      nutritionPayload.entry.id,
      `${label} nutrition snapshot`
    );
    assert(
      nutritionRow.source === "Starter Food Catalog" &&
        nutritionRow.source_version === "2026.09" &&
        Number(nutritionRow.serving_quantity) === 2 &&
        nutritionRow.serving_unit === "piece" &&
        nutritionRow.confidence === "high" &&
        nutritionRow.preparation_basis === "as_labeled" &&
        nutritionRow.estimated === true,
      `${label} nutrition metadata was not preserved`
    );
    const nutritionReplay = await rpc(userA.client, "save_nutrition_log", nutritionPayload, `${label} nutrition replay`, calls);
    assert(nutritionReplay.replayed === true, `${label} nutrition replay was not marked replayed`);

    const customNutritionId = id("nutrition-custom");
    await rpc(
      userA.client,
      "save_nutrition_log",
      {
        entry: {
          id: customNutritionId,
          date: "2026-09-10",
          slot: "snack",
          customName: "Reviewed homemade snack",
          servings: 1,
          servingQuantity: 1,
          servingUnit: "custom",
          calories: 200,
          proteinG: 5,
          carbsG: 20,
          fatG: 10,
          confidence: "low",
          source: "User-provided",
          sourceVersion: "manual",
          preparationBasis: "prepared",
        },
        idempotencyKey: id("nutrition-custom"),
      },
      `${label} custom nutrition`,
      calls
    );
    const deleteNutritionPayload = {
      nutritionLogId: customNutritionId,
      idempotencyKey: id("delete-nutrition"),
    };
    await rpc(userA.client, "delete_nutrition_log", deleteNutritionPayload, `${label} delete nutrition`, calls);
    assert(
      (await countRows(userA.client, "nutrition_logs", "app_id", customNutritionId, `${label} deleted nutrition`)) === 0,
      `${label} delete_nutrition_log left the row present`
    );
    const deleteNutritionReplay = await rpc(userA.client, "delete_nutrition_log", deleteNutritionPayload, `${label} delete nutrition replay`, calls);
    assert(deleteNutritionReplay.replayed === true, `${label} delete nutrition replay was not marked replayed`);

    await rpc(
      userB.client,
      "save_nutrition_log",
      {
        entry: {
          id: id("nutrition-b"),
          date: "2026-09-10",
          slot: "lunch",
          foodId: "food-egg",
          servings: 1,
          servingQuantity: 1,
          servingUnit: "piece",
          calories: 72,
          proteinG: 6.3,
          carbsG: 0.4,
          fatG: 4.8,
          confidence: "high",
          source: "Starter Food Catalog",
          sourceVersion: "2026.09",
          preparationBasis: "as_labeled",
        },
        idempotencyKey: id("nutrition-b"),
      },
      `${label} User B nutrition`,
      calls
    );
    const crossNutrition = await rawRpc(
      userA.client,
      "delete_nutrition_log",
      { nutritionLogId: id("nutrition-b"), idempotencyKey: id("cross-nutrition") },
      calls
    );
    assertError(crossNutrition, `${label} cross-user nutrition delete`, "P0001");
    assert(
      (await countRows(userB.client, "nutrition_logs", "app_id", id("nutrition-b"), `${label} User B nutrition isolation`)) === 1,
      `${label} cross-user nutrition delete changed User B data`
    );

    await rpc(
      userA.client,
      "save_weight_entry",
      { entry: { id: id("weight"), date: "2026-09-10", weightKg: 65.2 }, idempotencyKey: id("weight") },
      `${label} weight entry`,
      calls
    );

    const savedMealPayload = {
      meal: {
        id: id("saved-meal"),
        name: "Smoke-test meal",
        servings: 2,
        notes: "fixture",
        ingredients: [
          { foodId: "food-egg", servings: 2 },
          { foodId: "food-milk", servings: 1 },
        ],
      },
      idempotencyKey: id("saved-meal"),
    };
    await rpc(userA.client, "save_saved_meal", savedMealPayload, `${label} saved meal`, calls);
    assert(
      (await countRows(userA.client, "meals", "app_id", savedMealPayload.meal.id, `${label} saved meal row`)) === 1,
      `${label} saved meal was not persisted`
    );

    const recipePayload = {
      meal: {
        id: id("recipe"),
        name: "Smoke-test recipe",
        servings: 1,
        ingredients: [{ foodId: "food-egg", servings: 1 }],
      },
      idempotencyKey: id("recipe"),
    };
    const recipeResult = await rpc(userA.client, "save_recipe", recipePayload, `${label} recipe`, calls);
    assert(recipeResult.operation === "save_saved_meal", `${label} save_recipe alias changed unexpectedly`);
    const recipeReplay = await rpc(userA.client, "save_recipe", recipePayload, `${label} recipe replay`, calls);
    assert(recipeReplay.replayed === true, `${label} recipe replay was not marked replayed`);

    const systemMeal = await rawRpc(
      userA.client,
      "save_saved_meal",
      { meal: { id: "meal-yogurt-bowl", name: "overwrite", servings: 1, ingredients: [] }, idempotencyKey: id("system-meal") },
      calls
    );
    assertError(systemMeal, `${label} system meal overwrite`, "P0001");

    const groceryItemId = skippedPlan.grocery.items[0].id;
    await rpc(
      userA.client,
      "set_grocery_quantity",
      { itemId: groceryItemId, quantity: 5, idempotencyKey: id("set-grocery") },
      `${label} grocery quantity`,
      calls
    );
    await rpc(
      userA.client,
      "toggle_grocery_item",
      { itemId: groceryItemId, idempotencyKey: id("toggle-grocery") },
      `${label} grocery toggle`,
      calls
    );
    await rpc(
      userA.client,
      "remove_grocery_item",
      { itemId: groceryItemId, idempotencyKey: id("remove-grocery") },
      `${label} grocery remove`,
      calls
    );
    const regeneratePayload = {
      grocery: {
        id: skippedPlan.grocery.id,
        weekOf: skippedPlan.grocery.weekOf,
        items: [{ id: groceryItemId, generatedQuantity: 7 }],
      },
      idempotencyKey: id("regenerate-grocery"),
    };
    await rpc(userA.client, "regenerate_grocery", regeneratePayload, `${label} grocery regeneration`, calls);
    const groceryRow = await selectOne(
      userA.client,
      "grocery_items",
      "quantity, generated_quantity, checked, removed",
      "app_id",
      groceryItemId,
      `${label} regenerated grocery`
    );
    assert(
      Number(groceryRow.quantity) === 5 &&
        Number(groceryRow.generated_quantity) === 7 &&
        groceryRow.checked === true &&
        groceryRow.removed === true,
      `${label} grocery regeneration lost explicit user state`
    );
    const regenerateReplay = await rpc(userA.client, "regenerate_grocery", regeneratePayload, `${label} grocery replay`, calls);
    assert(regenerateReplay.replayed === true, `${label} grocery replay was not marked replayed`);
    await rpc(
      userA.client,
      "add_custom_grocery_item",
      {
        grocery: { id: skippedPlan.grocery.id, weekOf: skippedPlan.grocery.weekOf },
        item: { id: id("custom-grocery"), name: "Custom smoke item", category: "Other", unit: "pack", quantity: 1 },
        idempotencyKey: id("custom-grocery"),
      },
      `${label} custom grocery item`,
      calls
    );

    const crossGrocery = await rawRpc(
      userA.client,
      "toggle_grocery_item",
      { itemId: baseB.grocery.items[0].id, idempotencyKey: id("cross-grocery") },
      calls
    );
    assertError(crossGrocery, `${label} cross-user grocery toggle`, "P0001");
    const userBGrocery = await selectOne(
      userB.client,
      "grocery_items",
      "checked",
      "app_id",
      baseB.grocery.items[0].id,
      `${label} User B grocery isolation`
    );
    assert(userBGrocery.checked === false, `${label} cross-user grocery changed User B data`);

    const userBSessionId = id("session-b");
    await rpc(
      userB.client,
      "start_workout_session",
      {
        session: { id: userBSessionId, plannedWorkoutId: baseB.plan.workouts[0].id, date: "2026-09-09", startedAt: "2026-09-09T08:00:00Z" },
        idempotencyKey: id("start-session-b"),
      },
      `${label} User B session`,
      calls
    );
    for (const [name, payload] of [
      ["save_workout_session", { session: { id: userBSessionId, logs: [] }, idempotencyKey: id("cross-save-session") }],
      ["finish_workout_session", { session: { id: userBSessionId, logs: [] }, idempotencyKey: id("cross-finish-session") }],
      ["abandon_workout_session", { session: { id: userBSessionId }, idempotencyKey: id("cross-abandon-session") }],
    ]) {
      const crossSession = await rawRpc(userA.client, name, payload, calls);
      assertError(crossSession, `${label} cross-user ${name}`, "P0001");
    }
    await rpc(
      userB.client,
      "abandon_workout_session",
      { session: { id: userBSessionId }, idempotencyKey: id("cleanup-session-b") },
      `${label} User B session cleanup`,
      calls
    );

    const exportPayload = { idempotencyKey: id("export") };
    const exportResult = await rpc(userA.client, "export_account_data", exportPayload, `${label} export`, calls);
    assert(exportResult.data?.goals?.[0]?.app_id, `${label} export omitted application IDs`);
    assert(!("row_id" in exportResult.data.goals[0]), `${label} export exposed row_id`);
    assert(!("user_id" in exportResult.data.goals[0]), `${label} export exposed user_id`);
    const exportReplay = await rpc(userA.client, "export_account_data", exportPayload, `${label} export replay`, calls);
    assert(exportReplay.replayed === true, `${label} export replay was not marked replayed`);

    const deleteA = await rpc(
      userA.client,
      "delete_account",
      { idempotencyKey: id("delete-a") },
      `${label} delete User A`,
      calls
    );
    assert(deleteA.clear_cache === true, `${label} User A deletion omitted clear_cache`);
    userA.deleted = true;

    assert(
      calls.size === EXPECTED_RPCS.length && EXPECTED_RPCS.every((name) => calls.has(name)),
      `${label} RPC inventory mismatch. Called ${[...calls].sort().join(", ")}`
    );

    console.log(`${label} RPC smoke passed: all ${EXPECTED_RPCS.length} public wrappers exercised with two disposable users.`);
  } finally {
    const cleanup = [];
    if (userA && !userA.deleted) cleanup.push(deleteSession(userA, "user-a", calls));
    if (userB && !userB.deleted) cleanup.push(deleteSession(userB, "user-b", calls));
    if (cleanup.length) await Promise.all(cleanup);
  }
}

export async function createLocalSession(label, url, key) {
  const client = clientFor(url, key);
  const suffix = randomUUID();
  const email = `supabase-rpc-smoke-${label}-${suffix}@example.test`;
  const password = `LocalSmoke-${randomUUID()}!`;
  const signUp = await client.auth.signUp({ email, password });
  assertOk(signUp, `${label} local sign-up`);
  assert(signUp.data.user, `${label} local sign-up returned no user`);

  if (!signUp.data.session) {
    const signIn = await client.auth.signInWithPassword({ email, password });
    assertOk(signIn, `${label} local sign-in`);
  }

  return { client, userId: signUp.data.user.id, deleted: false };
}

export async function createSignedInSession(label, url, key, credentials) {
  const client = clientFor(url, key);
  const signIn = await client.auth.signInWithPassword(credentials);
  assertOk(signIn, `${label} remote sign-in`);
  assert(signIn.data.user, `${label} remote sign-in returned no user`);
  return { client, userId: signIn.data.user.id, deleted: false };
}
