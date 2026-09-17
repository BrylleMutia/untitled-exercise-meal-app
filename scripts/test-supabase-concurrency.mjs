import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:56321";
const configuredUrl = process.env.SUPABASE_LOCAL_URL ?? LOCAL_URL;

if (configuredUrl !== LOCAL_URL) {
  throw new Error(
    `Refusing concurrency tests: SUPABASE_LOCAL_URL must be exactly ${LOCAL_URL}. ` +
      "The runner never falls back to NEXT_PUBLIC_SUPABASE_URL."
  );
}

function localAnonKey() {
  const configuredKey =
    process.env.SUPABASE_LOCAL_PUBLISHABLE_KEY ??
    process.env.SUPABASE_LOCAL_ANON_KEY;
  if (configuredKey) return configuredKey;

  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npx";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx --yes supabase@latest status"]
      : ["--yes", "supabase@latest", "status"];
  let output;
  try {
    output = execFileSync(
      command,
      commandArgs,
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch {
    throw new Error(
      "Set SUPABASE_LOCAL_PUBLISHABLE_KEY (or SUPABASE_LOCAL_ANON_KEY), " +
        "or start Supabase and make its local status available."
    );
  }

  const match =
    output.match(/"(?:ANON_KEY|SUPABASE_ANON_KEY)"\s*:\s*"([^"]+)"/) ??
    output.match(/^(?:ANON_KEY|SUPABASE_ANON_KEY)=(?:"([^"]+)"|'([^']+)'|([^\r\n]+))/m) ??
    output.match(/"PUBLISHABLE_KEY"\s*:\s*"([^"]+)"/) ??
    output.match(/^PUBLISHABLE_KEY=(?:"([^"]+)"|'([^']+)'|([^\r\n]+))/m);
  const key = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!key) {
    throw new Error(
      "Local Supabase status did not expose an anon/publishable key. " +
        "Set SUPABASE_LOCAL_PUBLISHABLE_KEY explicitly."
    );
  }
  return key.trim();
}

const anonKey = localAnonKey();

function clientForSession() {
  return createClient(configuredUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function assertOk(error, context) {
  if (error) {
    const code = error.code ? ` (${error.code})` : "";
    throw new Error(`${context}${code}: ${error.message}`);
  }
}

async function createLocalUser(label) {
  const client = clientForSession();
  const suffix = randomUUID();
  const email = `supabase-concurrency-${label}-${suffix}@example.test`;
  const password = `LocalTest-${randomUUID()}!`;
  const signUp = await client.auth.signUp({ email, password });
  assertOk(signUp.error, `${label} sign-up failed`);

  if (!signUp.data.user) {
    throw new Error(`${label} sign-up did not return a local test user`);
  }

  if (!signUp.data.session) {
    const signIn = await client.auth.signInWithPassword({ email, password });
    assertOk(signIn.error, `${label} local sign-in failed`);
  }

  return { client, userId: signUp.data.user.id };
}

function onboardingPayload(userId, key, suffix = "") {
  const id = suffix ? `-${suffix}` : "";
  return {
    profile: {
      name: `Concurrency ${userId.slice(0, 6)}`,
      age: 30,
      sex: "female",
      heightCm: 165,
      weightKg: 65,
      units: "metric",
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
      id: `concurrency-target-${userId.slice(0, 6)}${id}`,
      effectiveDate: "2026-09-07",
      calories: 2000,
      proteinG: 120,
      carbsG: 220,
      fatG: 60,
      bmr: 1400,
      bmi: 24,
      tdee: 2000,
      activityFactor: 1.5,
      formula: "test-concurrency",
      calculationAssumptions: "local test",
      disclaimer: "Test estimates only.",
    },
    plan: {
      id: `concurrency-plan-${userId.slice(0, 6)}${id}`,
      workouts: [
        {
          id: `concurrency-workout-${userId.slice(0, 6)}${id}`,
          dayOfWeek: 1,
          title: "Concurrency workout",
          focus: "Full body",
          estimatedMinutes: 30,
          sortOrder: 1,
          warmup: [],
          cooldown: [],
          exercises: [
            {
              id: `concurrency-exercise-${userId.slice(0, 6)}${id}`,
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
      id: `concurrency-meal-plan-${userId.slice(0, 6)}${id}`,
      weekOf: "2026-09-07",
      meals: [
        {
          id: `concurrency-meal-${userId.slice(0, 6)}${id}`,
          date: "2026-09-07",
          slot: "breakfast",
          foodId: "food-egg",
          label: "Concurrency breakfast",
          servings: 1,
          expectedCalories: 72,
          expectedProteinG: 6.3,
          expectedCarbsG: 0.4,
          expectedFatG: 4.8,
          source: "Starter Food Catalog",
          sourceVersion: "2026.09",
          confidence: "high",
          preparationBasis: "as_labeled",
        },
      ],
    },
    grocery: {
      id: `concurrency-grocery-${userId.slice(0, 6)}${id}`,
      weekOf: "2026-09-07",
      items: [
        {
          id: `concurrency-grocery-item-${userId.slice(0, 6)}${id}`,
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
    effectiveDate: "2026-09-07",
    goalId: `concurrency-goal-${userId.slice(0, 6)}${id}`,
    idempotencyKey: key,
  };
}

async function rawRpc(client, name, payload) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await client.rpc(name, { p_payload: payload });
    if (!result.error || result.error.code !== "PGRST303" || attempt === 3) return result;

    await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    await client.auth.refreshSession();
  }

  throw new Error("Supabase RPC retry budget exhausted");
}

async function rpc(client, name, payload, context) {
  const result = await rawRpc(client, name, payload);
  assertOk(result.error, context);
  if (!result.data) throw new Error(`${context}: RPC returned no data`);
  return result.data;
}

async function countRows(client, table, column, value, context) {
  const result = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  assertOk(result.error, context);
  return result.count ?? 0;
}

async function deleteLocalUser(session, label) {
  if (!session) return;
  try {
    await rpc(
      session.client,
      "delete_account",
      { idempotencyKey: `concurrency-delete-${label}-${randomUUID()}` },
      `${label} cleanup failed`
    );
  } catch (error) {
    // Do not print credentials or a full response. A failed cleanup is a
    // hard failure because this runner must not leave local auth fixtures.
    throw new Error(`${label} cleanup failed: ${error.message}`);
  }
}

async function run() {
  let userA;
  let userB;
  try {
    [userA, userB] = await Promise.all([
      createLocalUser("a"),
      createLocalUser("b"),
    ]);

    const baseA = onboardingPayload(userA.userId, "concurrency-onboard-a");
    const baseB = onboardingPayload(userB.userId, "concurrency-onboard-b");

    const [onboardA, onboardB] = await Promise.all([
      Promise.all([
        rpc(userA.client, "complete_onboarding", baseA, "User A onboarding 1"),
        rpc(userA.client, "complete_onboarding", baseA, "User A onboarding 2"),
      ]),
      Promise.all([
        rpc(userB.client, "complete_onboarding", baseB, "User B onboarding 1"),
        rpc(userB.client, "complete_onboarding", baseB, "User B onboarding 2"),
      ]),
    ]);

    if (!onboardA.some((result) => result.replayed) || !onboardB.some((result) => result.replayed)) {
      throw new Error("Concurrent duplicate onboarding did not produce a replay");
    }

    for (const [session, label] of [[userA, "User A"], [userB, "User B"]]) {
      const goals = await countRows(session.client, "goals", "user_id", session.userId, `${label} goal count`);
      const targets = await countRows(session.client, "daily_targets", "user_id", session.userId, `${label} target count`);
      const plans = await countRows(session.client, "workout_plans", "user_id", session.userId, `${label} plan count`);
      if (goals !== 1 || targets !== 1 || plans !== 1) {
        throw new Error(`${label} concurrent onboarding created an invalid current version set`);
      }
    }

    const planUpdate = structuredClone(baseA);
    planUpdate.idempotencyKey = "concurrency-plan-update-a";
    planUpdate.effectiveDate = "2026-09-10";
    planUpdate.goalId = `concurrency-goal-update-${userA.userId.slice(0, 6)}`;
    planUpdate.target.id = `concurrency-target-update-${userA.userId.slice(0, 6)}`;
    planUpdate.target.effectiveDate = "2026-09-10";
    planUpdate.plan.workouts[0].title = "Concurrency workout update";
    planUpdate.mealPlan.id = `concurrency-meal-plan-update-${userA.userId.slice(0, 6)}`;
    const planUpdates = await Promise.all([
      rpc(userA.client, "update_profile", planUpdate, "concurrent plan update 1"),
      rpc(userA.client, "update_profile", planUpdate, "concurrent plan update 2"),
    ]);
    if (!planUpdates.some((result) => result.replayed)) {
      throw new Error("Concurrent plan update did not produce an idempotent replay");
    }
    const updatedPlanCount = await countRows(userA.client, "workout_plans", "user_id", userA.userId, "updated plan count");
    const updatedWorkoutCount = await countRows(userA.client, "planned_workouts", "user_id", userA.userId, "updated planned workout count");
    if (updatedPlanCount !== 2 || updatedWorkoutCount !== 2) {
      throw new Error("Concurrent plan update corrupted the current plan version set");
    }

    // Two different idempotency keys with the same profile revision must not
    // silently overwrite one another. One request commits; the other reports
    // the typed stale_version conflict after the shared preflight lock.
    const profileRevisionResult = await userA.client
      .from("profiles")
      .select("revision")
      .eq("id", userA.userId)
      .single();
    assertOk(profileRevisionResult.error, "profile revision read failed");
    const expectedProfileRevision = profileRevisionResult.data.revision;
    const staleOne = onboardingPayload(userA.userId, "concurrency-stale-one", "stale-one");
    const staleTwo = onboardingPayload(userA.userId, "concurrency-stale-two", "stale-two");
    staleOne.profile.name = "Concurrency stale winner";
    staleTwo.profile.name = "Concurrency stale loser";
    staleOne.expectedVersions = { profileRevision: expectedProfileRevision };
    staleTwo.expectedVersions = { profileRevision: expectedProfileRevision };
    const staleResults = await Promise.all([
      rawRpc(userA.client, "update_profile", staleOne),
      rawRpc(userA.client, "update_profile", staleTwo),
    ]);
    const staleFailures = staleResults.filter((result) => result.error);
    if (staleFailures.length !== 1 || !staleFailures[0].error.message.includes("stale_version")) {
      throw new Error("Concurrent profile edits did not produce exactly one typed stale_version conflict");
    }

    const mismatchPayloadOne = onboardingPayload(userA.userId, "concurrency-hash-mismatch");
    const mismatchPayloadTwo = onboardingPayload(userA.userId, "concurrency-hash-mismatch", "different");
    const mismatchResults = await Promise.all([
      rawRpc(userA.client, "complete_onboarding", mismatchPayloadOne),
      rawRpc(userA.client, "complete_onboarding", mismatchPayloadTwo),
    ]);
    const mismatchFailures = mismatchResults.filter((result) => result.error);
    if (mismatchFailures.length !== 1) {
      throw new Error("Concurrent idempotency hash mismatch did not produce exactly one failure");
    }

    const workoutId = baseA.plan.workouts[0].id;
    const plannedExerciseId = baseA.plan.workouts[0].exercises[0].id;
    const sessionId = `concurrency-session-${userA.userId.slice(0, 6)}`;
    const startPayload = {
      session: {
        id: sessionId,
        plannedWorkoutId: workoutId,
        date: "2026-09-10",
        startedAt: "2026-09-10T08:00:00Z",
      },
      idempotencyKey: "concurrency-start-a",
    };
    await Promise.all([
      rpc(userA.client, "start_workout_session", startPayload, "concurrent workout start 1"),
      rpc(userA.client, "start_workout_session", startPayload, "concurrent workout start 2"),
    ]);

    const logs = [
      {
        plannedExerciseId,
        actualExerciseId: "ex-knee-push-up",
        status: "completed",
        actual: { sets: 3, reps: 8 },
        rpe: 6,
        manageable: true,
        pain: false,
      },
    ];
    const finishPayload = {
      session: { id: sessionId, logs, finishedAt: "2026-09-10T08:30:00Z" },
      idempotencyKey: "concurrency-finish-a",
    };
    await Promise.all([
      rpc(userA.client, "finish_workout_session", finishPayload, "concurrent workout finish 1"),
      rpc(userA.client, "finish_workout_session", finishPayload, "concurrent workout finish 2"),
    ]);
    const sessionResult = await userA.client
      .from("workout_sessions")
      .select("status")
      .eq("user_id", userA.userId)
      .eq("app_id", sessionId)
      .single();
    assertOk(sessionResult.error, "final concurrent workout session read failed");
    if (sessionResult.data.status !== "completed") throw new Error("Concurrent workout did not finish once");
    const logCount = await countRows(userA.client, "exercise_logs", "user_id", userA.userId, "exercise log count");
    if (logCount !== 1) throw new Error("Concurrent workout completion produced duplicate logs");

    const groceryItemId = baseA.grocery.items[0].id;
    await rpc(userA.client, "set_grocery_quantity", {
      itemId: groceryItemId,
      quantity: 5,
      idempotencyKey: "concurrency-grocery-set",
    }, "grocery quantity override");
    await rpc(userA.client, "toggle_grocery_item", {
      itemId: groceryItemId,
      idempotencyKey: "concurrency-grocery-toggle",
    }, "grocery checked state");
    await rpc(userA.client, "remove_grocery_item", {
      itemId: groceryItemId,
      idempotencyKey: "concurrency-grocery-remove",
    }, "grocery removed state");
    const regeneratePayload = {
      grocery: {
        id: baseA.grocery.id,
        weekOf: baseA.grocery.weekOf,
        items: [{ id: groceryItemId, generatedQuantity: 7 }],
      },
      idempotencyKey: "concurrency-grocery-regenerate",
    };
    await Promise.all([
      rpc(userA.client, "regenerate_grocery", regeneratePayload, "concurrent grocery regeneration 1"),
      rpc(userA.client, "regenerate_grocery", regeneratePayload, "concurrent grocery regeneration 2"),
    ]);
    const groceryResult = await userA.client
      .from("grocery_items")
      .select("quantity, generated_quantity, checked, removed")
      .eq("user_id", userA.userId)
      .eq("app_id", groceryItemId)
      .single();
    assertOk(groceryResult.error, "final concurrent grocery read failed");
    if (
      groceryResult.data.quantity !== 5 ||
      groceryResult.data.generated_quantity !== 7 ||
      groceryResult.data.checked !== true ||
      groceryResult.data.removed !== true
    ) {
      throw new Error("Concurrent grocery regeneration lost an explicit user state");
    }

    const crossUser = await rawRpc(userA.client, "toggle_grocery_item", {
      itemId: baseB.grocery.items[0].id,
      idempotencyKey: "concurrency-cross-user",
    });
    if (!crossUser.error) throw new Error("User A unexpectedly mutated User B data");
    const userBItem = await userB.client
      .from("grocery_items")
      .select("checked")
      .eq("user_id", userB.userId)
      .eq("app_id", baseB.grocery.items[0].id)
      .single();
    assertOk(userBItem.error, "User B cross-user isolation read failed");
    if (userBItem.data.checked !== false) throw new Error("User B grocery state changed from User A request");

    console.log("Supabase local concurrency checks passed (2 users, duplicate replay, hash mismatch, stale profile conflict, workout, grocery, isolation).");
  } finally {
    await Promise.all([
      deleteLocalUser(userA, "User A"),
      deleteLocalUser(userB, "User B"),
    ]);
  }
}

run().catch((error) => {
  console.error(`Supabase local concurrency checks failed: ${error.message}`);
  process.exitCode = 1;
});
