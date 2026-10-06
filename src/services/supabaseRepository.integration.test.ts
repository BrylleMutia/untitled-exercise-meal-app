import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayKey } from "@/utility/dates";
import { createSupabaseRepository } from "@/services/supabaseRepository";
import type { Database } from "@/types/database.generated";
import type { AppSnapshot, UserProfile, WorkoutSession } from "@/types/domain";

const localUrl = "http://127.0.0.1:56321";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (url !== localUrl || !key) {
  throw new Error(`Repository integration tests require the local Supabase stack at ${localUrl}.`);
}

type TestAccount = {
  client: SupabaseClient<Database>;
  repository: ReturnType<typeof createSupabaseRepository>;
  id: string;
  email: string;
  password: string;
};

const accounts: TestAccount[] = [];

function makeClient() {
  return createClient<Database>(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createAccount(): Promise<TestAccount> {
  const client = makeClient();
  const id = randomUUID();
  const email = `repo-${id}@example.test`;
  const password = `Local-${randomUUID()}-Pass!`;
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  let session = data.session;
  let user = data.user;
  if (!session) {
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) {
      throw signedIn.error ?? new Error("Local test account did not receive a session.");
    }
    session = signedIn.data.session;
    user = signedIn.data.user;
  }
  if (!user?.id || !session) throw new Error("Local test account was created without an authenticated identity.");
  const account = { client, repository: createSupabaseRepository(client), id: user.id, email, password };
  accounts.push(account);
  return account;
}

function profile(id: string, name: string): UserProfile {
  return {
    id,
    name,
    age: 30,
    sex: "female",
    heightCm: 168,
    weightKg: 68,
    units: "metric",
    experience: "beginner",
    equipment: ["none"],
    daysPerWeek: 3,
    sessionMinutes: 45,
    goal: "maintain",
    dietaryPattern: "No restrictions",
    allergies: [],
    notificationsEnabled: false,
    targetEligibility: "eligible",
    eligibilityVersion: "calicoach-eligibility-v1",
    createdAt: new Date().toISOString(),
  };
}

function eggEntry(date: string) {
  return {
    date,
    slot: "breakfast" as const,
    foodId: "food-egg",
    servings: 1,
    servingQuantity: 1,
    servingUnit: "piece" as const,
    calories: 72,
    proteinG: 6.3,
    carbsG: 0.4,
    fatG: 4.8,
    estimated: true,
    confidence: "high" as const,
    source: "Starter Food Catalog",
    sourceVersion: "2026.09",
    preparationBasis: "as_labeled" as const,
    valueSource: "development_catalog" as const,
  };
}

function completedSession(snapshot: AppSnapshot, session: WorkoutSession): WorkoutSession {
  const workout = snapshot.plan?.workouts.find((item) => item.id === session.plannedWorkoutId);
  if (!workout) throw new Error("Started workout was not present in the refreshed plan.");
  return {
    ...session,
    logs: workout.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      plannedExerciseId: exercise.id,
      planned: {
        sets: exercise.sets,
        ...(exercise.reps === undefined ? {} : { reps: exercise.reps }),
        ...(exercise.holdSeconds === undefined ? {} : { holdSeconds: exercise.holdSeconds }),
      },
      actual: {
        sets: exercise.sets,
        ...(exercise.reps === undefined ? {} : { reps: exercise.reps }),
        ...(exercise.holdSeconds === undefined ? {} : { holdSeconds: exercise.holdSeconds }),
      },
      status: "completed" as const,
      rpe: 5,
    })),
  };
}

describe("Supabase repository against the disposable local stack", () => {
  let userA: TestAccount;
  let userB: TestAccount;
  let initialA: AppSnapshot;

  it("persists Pilates and carb-limited future plans without changing completed history", async () => {
    const account = await createAccount();
    const empty = await account.repository.load();
    if (!empty) throw new Error("Missing local snapshot");
    const onboarded = await account.repository.completeOnboarding({ profile: { ...profile(account.id, "MVP3 plans"), trainingProgram: "pilates", dietaryPattern: "Keto-style", cookingTimeMinutes: 30 }, currentSnapshot: empty, idempotencyKey: randomUUID() });
    expect(onboarded.snapshot.profile?.trainingProgram).toBe("pilates");
    expect(onboarded.snapshot.plan?.trainingProgram).toBe("pilates");
    expect(onboarded.snapshot.target?.carbsG).toBeLessThanOrEqual(50);
    expect(onboarded.snapshot.nutritionWeekTargets).toHaveLength(1);
    expect(onboarded.snapshot.nutritionWeekTargets[0]).toEqual(onboarded.snapshot.target);
    const meals = onboarded.snapshot.mealPlan!.meals;
    expect(meals.filter((meal) => Boolean(meal.foodId || meal.mealId))).toHaveLength(28);
    for (const date of new Set(meals.map((meal) => meal.date))) expect(meals.filter((meal) => meal.date === date).reduce((sum, meal) => sum + (meal.expectedCarbsG ?? 0), 0)).toBeLessThanOrEqual(50);
    const started = await account.repository.startSession({ workoutId: onboarded.snapshot.plan!.workouts[0].id, currentSnapshot: onboarded.snapshot, idempotencyKey: randomUUID() });
    const session = started.snapshot.sessions[0];
    const logged = await account.repository.saveSession({ session: completedSession(started.snapshot, session), currentSnapshot: started.snapshot, idempotencyKey: randomUUID() });
    const finished = await account.repository.finishSession({ session: logged.snapshot.sessions.find((item) => item.id === session.id)!, currentSnapshot: logged.snapshot, idempotencyKey: randomUUID() });
    expect(finished.snapshot.sessions[0].trainingProgram).toBe("pilates");
    const selected = await account.repository.selectTrainingProgram({ program: "calisthenics", currentSnapshot: finished.snapshot, idempotencyKey: randomUUID() });
    expect(selected.snapshot.plan?.trainingProgram).toBe("calisthenics");
    expect(selected.snapshot.sessions[0]).toEqual(finished.snapshot.sessions[0]);
    const edited = structuredClone(selected.snapshot.mealPlan!);
    edited.meals[0] = { ...edited.meals[0], mealId: undefined, foodId: "food-mvp3-170567", servings: 20 };
    await expect(account.repository.editMealPlan({ mealPlan: edited, currentSnapshot: selected.snapshot, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
  });

  it("keeps step retries, revisions, deletion and cross-user ownership consistent", async () => {
    const date = todayKey();
    const idempotencyKey = randomUUID();
    const saved = await userA.repository.saveDailySteps({ date, steps: 6500, walkingMinutes: 35, expectedRevision: 0, idempotencyKey });
    const replay = await userA.repository.saveDailySteps({ date, steps: 6500, walkingMinutes: 35, expectedRevision: 0, idempotencyKey });
    expect(replay.snapshot.dailySteps).toEqual(saved.snapshot.dailySteps);
    expect((await userB.client.from("daily_step_entries").select("*").eq("user_id",userA.id)).data).toEqual([]);
    expect((await userA.client.from("daily_step_entries").insert({ user_id: userA.id, entry_date: date, steps: 3 })).error).toBeTruthy();
    await expect(userA.repository.saveDailySteps({ date, steps: 3, expectedRevision: 0, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    const deleteKey = randomUUID();
    const removed = await userA.repository.deleteDailySteps({ date, expectedRevision: 1, idempotencyKey: deleteKey });
    const repeatDelete = await userA.repository.deleteDailySteps({ date, expectedRevision: 1, idempotencyKey: deleteKey });
    expect(repeatDelete.snapshot.dailySteps).toEqual(removed.snapshot.dailySteps);
    const replacement = await userA.repository.saveDailySteps({ date, steps: 0, expectedRevision: 0, idempotencyKey: randomUUID() });
    expect(replacement.snapshot.dailySteps.find((entry) => entry.date===date)?.revision).toBe(2);
    await expect(userA.repository.saveDailySteps({ date, steps: 500, expectedRevision: 1, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
  });

  it("versions custom routines and keeps immutable session prescriptions and actuals", async () => {
    const snapshot = await userA.repository.load();
    if (!snapshot?.profile) throw new Error("Missing profile");
    const id = randomUUID();
    const definition = { name: "My routine", movements: [{ id: "reach", name: "Gentle reach", sets: 2, reps: 6, restSeconds: 45 }] };
    const key = randomUUID();
    const saved = await userA.repository.saveCustomWorkout({ id, definition, expectedVersion: 0, profile: snapshot.profile, idempotencyKey: key });
    const replay = await userA.repository.saveCustomWorkout({ id, definition, expectedVersion: 0, profile: snapshot.profile, idempotencyKey: key });
    expect(replay.snapshot.customWorkouts).toEqual(saved.snapshot.customWorkouts);
    const startKey = randomUUID();
    const started = await userA.repository.startCustomWorkout({ id: `session-${startKey}`, workoutId: id, expectedVersion: 1, date: todayKey(), idempotencyKey: startKey });
    const session = started.snapshot.customSessions[0];
    const finished = await userA.repository.saveCustomSession({ id: session.id, expectedRevision: 1, actual: [{ movementId: "reach", sets: 2, reps: 6, status: "completed", rpe: 5, note: "Comfortable" }], status: "completed", idempotencyKey: randomUUID() });
    const changed = await userA.repository.saveCustomWorkout({ id, expectedVersion: 1, definition: { ...definition, movements: [{ ...definition.movements[0], reps: 8 }] }, profile: snapshot.profile, idempotencyKey: randomUUID() });
    expect(changed.snapshot.customWorkouts.find((routine) => routine.id===id)?.version).toBe(2);
    expect(changed.snapshot.customSessions[0]).toEqual(finished.snapshot.customSessions[0]);
    expect(changed.snapshot.customSessions[0].planned.movements[0].reps).toBe(6);
    expect((await userB.client.from("current_custom_workouts").select("*").eq("user_id",userA.id)).data).toEqual([]);
    await expect(userB.repository.startCustomWorkout({ id: randomUUID(), workoutId: id, expectedVersion: 2, date: todayKey(), idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "not_found" } });
    await expect(userA.repository.saveCustomWorkout({ id, expectedVersion: 1, definition, profile: snapshot.profile, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    const exported = await userA.repository.exportData({ idempotencyKey: randomUUID() });
    expect(exported.data?.customWorkoutVersions.filter((row) => row.app_id===id)).toHaveLength(2);
    expect(exported.data?.customWorkoutSessions.find((row) => row.app_id===session.id)).toBeTruthy();
    expect(exported.data?.dailySteps.length).toBeGreaterThan(0);
  });

  it("rejects competing step, routine, and session edits without overwriting the winner", async () => {
    const snapshot = await userA.repository.load();
    if (!snapshot?.profile) throw new Error("Missing profile");
    const date = addDays(todayKey(), -3);
    await userA.repository.saveDailySteps({ date, steps: 100, expectedRevision: 0, idempotencyKey: randomUUID() });
    const assertOneWinner = (results: PromiseSettledResult<unknown>[]) => {
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      if (!rejected || rejected.status !== "rejected") throw new Error("Expected competing edit to be rejected");
      expect(rejected.reason).toMatchObject({ repositoryError: { code: "stale_version" } });
    };
    assertOneWinner(await Promise.allSettled([200, 300].map((steps) => userA.repository.saveDailySteps({ date, steps, expectedRevision: 1, idempotencyKey: randomUUID() }))));
    const observed = (await userA.repository.load())?.dailySteps.find((entry) => entry.date === date);
    expect(observed?.revision).toBe(2);
    expect([200, 300]).toContain(observed?.steps);
    const id = randomUUID();
    const definition = { name: "Concurrent routine", movements: [{ id: "reach", name: "Familiar reach", sets: 2, reps: 6, restSeconds: 45 }] };
    await userA.repository.saveCustomWorkout({ id, expectedVersion: 0, definition, profile: snapshot.profile, idempotencyKey: randomUUID() });
    assertOneWinner(await Promise.allSettled([7, 8].map((reps) => userA.repository.saveCustomWorkout({ id, expectedVersion: 1, definition: { ...definition, movements: [{ ...definition.movements[0], reps }] }, profile: snapshot.profile!, idempotencyKey: randomUUID() }))));
    const started = await userA.repository.startCustomWorkout({ id: randomUUID(), workoutId: id, expectedVersion: 2, date: todayKey(), idempotencyKey: randomUUID() });
    const session = started.snapshot.customSessions.find((item) => item.status === "in_progress");
    if (!session) throw new Error("Missing concurrent test session");
    assertOneWinner(await Promise.allSettled([6, 7].map((reps) => userA.repository.saveCustomSession({ id: session.id, expectedRevision: 1, status: "in_progress", actual: [{ movementId: "reach", sets: 2, reps, status: "modified" }], idempotencyKey: randomUUID() }))));
    const saved = (await userA.repository.load())?.customSessions.find((item) => item.id === session.id);
    expect(saved?.revision).toBe(2);
    expect(saved?.planned).toEqual(session.planned);
    expect([6, 7]).toContain(saved?.actual[0].reps);
    await userA.repository.saveCustomSession({ id: session.id, expectedRevision: 2, status: "abandoned", actual: saved!.actual, idempotencyKey: randomUUID() });
  });

  beforeAll(async () => {
    userA = await createAccount();
    userB = await createAccount();
    const empty = await userA.repository.load();
    if (!empty) throw new Error("Authenticated local account did not hydrate an initial snapshot.");
    expect(empty.nutritionWeekTargets).toEqual([]);
    initialA = empty;
    const onboarded = await userA.repository.completeOnboarding({
      profile: { ...profile(userA.id, "Repository Integration"), dailyStepTarget: 7500 },
      currentSnapshot: empty,
      idempotencyKey: `repo-onboard-${randomUUID()}`,
    });
    initialA = onboarded.snapshot;
    expect((await userA.repository.load())?.profile?.dailyStepTarget).toBe(7500);
  });

  afterAll(async () => {
    const failures: string[] = [];
    for (const account of [...accounts].reverse()) {
      try {
        await account.repository.deleteAccount({ confirmation: "DELETE", idempotencyKey: `repo-cleanup-${randomUUID()}` });
      } catch {
        failures.push(account.email);
      }
    }
    if (failures.length) throw new Error(`Local integration account cleanup failed for ${failures.length} disposable account(s).`);
  });

  it("hydrates the authenticated plan bundle, preserves history, and rejects stale edits", async () => {
    expect(initialA.onboarded).toBe(true);
    expect(initialA.profile?.id).toBe(userA.id);
    expect(initialA.plan?.workouts.length).toBeGreaterThan(0);
    expect(initialA.mealPlan?.meals.length).toBeGreaterThan(0);
    expect(initialA.grocery?.items.length).toBeGreaterThan(0);

    const staleClient = makeClient();
    const signedIn = await staleClient.auth.signInWithPassword({ email: userA.email, password: userA.password });
    expect(signedIn.error).toBeNull();
    const staleRepository = createSupabaseRepository(staleClient);
    const stale = await staleRepository.load();
    if (!stale?.profile) throw new Error("Second repository client did not hydrate the owner profile.");

    const current = await userA.repository.load();
    if (!current?.profile) throw new Error("Owner profile disappeared during the test.");
    const update = await userA.repository.updateProfile({
      profile: { ...current.profile, name: "Repository Updated" },
      currentSnapshot: current,
      idempotencyKey: `repo-name-${randomUUID()}`,
    });
    expect(update.snapshot.profile?.name).toBe("Repository Updated");

    const staleProfile = { ...stale.profile, name: "Must Not Win" };
    await expect(staleRepository.updateProfile({
      profile: staleProfile,
      currentSnapshot: stale,
      idempotencyKey: `repo-stale-${randomUUID()}`,
    })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    const latest = await userA.repository.load();
    expect(latest?.profile?.name).toBe("Repository Updated");
    await staleClient.auth.signOut();
  });

  it("finishes a workout against its original prescription and keeps that history after plan edits", async () => {
    const before = await userA.repository.load();
    if (!before?.plan?.workouts[0] || !before.profile) throw new Error("Workout plan fixture is missing.");
    const start = await userA.repository.startSession({
      workoutId: before.plan.workouts[0].id,
      currentSnapshot: before,
      idempotencyKey: `repo-session-start-${randomUUID()}`,
    });
    const active = start.snapshot.sessions.find((session) => session.status === "in_progress");
    if (!active) throw new Error("Workout session was not hydrated after start.");
    const finish = await userA.repository.finishSession({
      session: completedSession(start.snapshot, active),
      currentSnapshot: start.snapshot,
      idempotencyKey: `repo-session-finish-${randomUUID()}`,
    });
    const finished = finish.snapshot.sessions.find((session) => session.id === active.id);
    expect(finished?.status).toBe("completed");
    expect(finished?.plannedPlanVersion).toBe(before.plan.version);

    const latest = finish.snapshot;
    const changedProfile = { ...latest.profile!, sessionMinutes: latest.profile!.sessionMinutes === 45 ? 60 : 45 };
    const updated = await userA.repository.updateProfile({
      profile: changedProfile,
      currentSnapshot: latest,
      idempotencyKey: `repo-plan-update-${randomUUID()}`,
    });
    expect(updated.snapshot.plan?.version).toBeGreaterThan(before.plan.version);
    expect(updated.snapshot.sessions.find((session) => session.id === active.id)?.plannedPlanVersion).toBe(before.plan.version);
  });

  it("persists idempotent nutrition entries, paginates history, and isolates accounts", async () => {
    const dates = [0, -1, -2, -3].map((offset) => addDays(todayKey(), offset));
    const first = await userA.repository.saveNutrition({ entry: eggEntry(dates[0]), idempotencyKey: `repo-egg-${randomUUID()}` });
    const idempotentKey = `repo-replay-${randomUUID()}`;
    const saved = await userA.repository.saveNutrition({ entry: eggEntry(dates[1]), idempotencyKey: idempotentKey });
    const replay = await userA.repository.saveNutrition({ entry: eggEntry(dates[1]), idempotencyKey: idempotentKey });
    expect(replay.snapshot.nutritionLogs.filter((entry) => entry.date === dates[1])).toHaveLength(1);
    expect(first.snapshot.nutritionLogs.length).toBeGreaterThan(0);
    expect(saved.events[0]?.type).toBe("nutrition-entry-saved");
    await userA.repository.saveNutrition({ entry: eggEntry(dates[2]), idempotencyKey: `repo-egg-${randomUUID()}` });
    await userA.repository.saveNutrition({ entry: eggEntry(dates[3]), idempotencyKey: `repo-egg-${randomUUID()}` });

    const range = { from: dates[3], to: dates[0], limit: 2 };
    const pageOne = await userA.repository.loadHistory(range);
    expect(pageOne.nutritionLogs).toHaveLength(2);
    expect(pageOne.nextCursors.nutrition).toBeTruthy();
    const pageTwo = await userA.repository.loadHistory({ ...range, nutritionCursor: pageOne.nextCursors.nutrition });
    expect(pageTwo.nutritionLogs).toHaveLength(2);
    expect(new Set([...pageOne.nutritionLogs, ...pageTwo.nutritionLogs].map((entry) => entry.id)).size).toBe(4);

    const emptyB = await userB.repository.load();
    expect(emptyB?.profile).toBeNull();
    expect(emptyB?.nutritionLogs).toHaveLength(0);
  });

  it("changes only the daily step preference, supports retry, and rejects stale and cross-owner writes", async () => {
    const initial = await userA.repository.load();
    const observation = await userA.repository.saveDailySteps({ date: todayKey(), steps: 6500, walkingMinutes: 35, expectedRevision: initial?.dailySteps.find((entry) => entry.date === todayKey())?.revision ?? 0, idempotencyKey: `steps-${randomUUID()}` });
    const before = observation.snapshot;
    const revision = before.profile!.revision!;
    const key = `step-target-${randomUUID()}`;
    const input = { target: 8000, expectedRevision: revision, idempotencyKey: key };
    const saved = await userA.repository.setDailyStepTarget(input);
    const retry = await userA.repository.setDailyStepTarget(input);
    expect(saved.snapshot.profile?.dailyStepTarget).toBe(8000);
    expect(retry.snapshot.profile?.revision).toBe(saved.snapshot.profile?.revision);
    expect(saved.snapshot.plan).toEqual(before.plan);
    expect(saved.snapshot.mealPlan).toEqual(before.mealPlan);
    expect(saved.snapshot.target).toEqual(before.target);
    expect(saved.snapshot.dailySteps).toEqual(before.dailySteps);
    expect(saved.snapshot.sessions).toEqual(before.sessions);
    await expect(userA.repository.setDailyStepTarget({ target: 9000, expectedRevision: revision, idempotencyKey: `stale-target-${randomUUID()}` })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    const crossOwner = await userB.client.rpc("set_daily_step_target", { p_payload: { target: 9000, expectedRevision: saved.snapshot.profile!.revision!, userId: userA.id, idempotencyKey: `other-target-${randomUUID()}` } });
    expect(crossOwner.error).not.toBeNull();
    expect((await userA.repository.load())?.profile?.dailyStepTarget).toBe(8000);
    const anon = makeClient();
    const unauthenticated = await anon.rpc("set_daily_step_target", { p_payload: { ...input, idempotencyKey: `anon-${randomUUID()}` } });
    expect(unauthenticated.error).not.toBeNull();
    const directWrite = await userA.client.from("profiles").update({ daily_step_target: 9000 }).eq("id", userA.id);
    expect(directWrite.error).not.toBeNull();
    const { dailyStepTarget: omitted, ...oldProfile } = saved.snapshot.profile!;
    expect(omitted).toBe(8000);
    const renamed = await userA.repository.updateProfile({ profile: { ...oldProfile, name: "Target retained" }, currentSnapshot: saved.snapshot, idempotencyKey: `omit-${randomUUID()}` });
    expect(renamed.snapshot.profile?.dailyStepTarget).toBe(8000);
    const cleared = await userA.repository.setDailyStepTarget({ target: null, expectedRevision: renamed.snapshot.profile!.revision!, idempotencyKey: `clear-${randomUUID()}` });
    expect(cleared.snapshot.profile?.dailyStepTarget).toBeUndefined();
    expect(cleared.snapshot.dailySteps).toEqual(before.dailySteps);
  });

  it("serializes competing step targets and concurrent retries while preserving unrelated profile edits", async () => {
    const before = await userA.repository.load();
    if (!before?.profile) throw new Error("Missing profile");
    const revision = before.profile.revision!;
    const results = await Promise.allSettled([7000, 9000].map((target) => userA.repository.setDailyStepTarget({ target, expectedRevision: revision, idempotencyKey: randomUUID() })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (!rejected || rejected.status !== "rejected") throw new Error("Expected stale competing target");
    expect(rejected.reason).toMatchObject({ repositoryError: { code: "stale_version" } });
    const winner = await userA.repository.load();
    expect(winner?.profile?.revision).toBe(revision + 1);
    expect([7000, 9000]).toContain(winner?.profile?.dailyStepTarget);

    const retryInput = { target: 8000, expectedRevision: winner!.profile!.revision!, idempotencyKey: randomUUID() };
    const retries = await Promise.all([userA.repository.setDailyStepTarget(retryInput), userA.repository.setDailyStepTarget(retryInput)]);
    expect(retries[0].snapshot.profile).toEqual(retries[1].snapshot.profile);
    expect(retries[0].snapshot.profile?.revision).toBe(retryInput.expectedRevision + 1);
    const confirmed = retries[0].snapshot;
    const { dailyStepTarget: omitted, ...legacyProfile } = confirmed.profile!;
    expect(omitted).toBe(8000);
    // A plan-affecting profile update from an older client must retain the preference.
    const regenerated = await userA.repository.updateProfile({ profile: { ...legacyProfile, sessionMinutes: legacyProfile.sessionMinutes === 30 ? 45 : 30 }, currentSnapshot: confirmed, idempotencyKey: randomUUID() });
    expect(regenerated.snapshot.profile?.dailyStepTarget).toBe(8000);
    expect(regenerated.snapshot.dailySteps).toEqual(before.dailySteps);
    expect(regenerated.snapshot.sessions).toEqual(before.sessions);
    const exported = await userA.repository.exportData({ idempotencyKey: randomUUID() });
    expect(exported.data?.profile?.daily_step_target).toBe(8000);
  });

  it("reconciles generated groceries without losing custom entries", async () => {
    const snapshot = await userA.repository.load();
    if (!snapshot) throw new Error("Grocery owner snapshot is missing.");
    const customName = `Repository custom ${randomUUID().slice(0, 8)}`;
    const added = await userA.repository.addCustomGrocery({
      name: customName,
      quantity: 2,
      unit: "item",
      currentSnapshot: snapshot,
      idempotencyKey: `repo-grocery-${randomUUID()}`,
    });
    expect(added.snapshot.grocery?.items.some((item) => item.name === customName && item.custom)).toBe(true);

    const regenerated = await userA.repository.regenerateGrocery({
      currentSnapshot: added.snapshot,
      idempotencyKey: `repo-regenerate-${randomUUID()}`,
    });
    expect(regenerated.snapshot.grocery?.items.some((item) => item.name === customName && item.custom)).toBe(true);
  });
});
