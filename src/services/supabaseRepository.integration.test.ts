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

  beforeAll(async () => {
    userA = await createAccount();
    userB = await createAccount();
    const empty = await userA.repository.load();
    if (!empty) throw new Error("Authenticated local account did not hydrate an initial snapshot.");
    initialA = empty;
    const onboarded = await userA.repository.completeOnboarding({
      profile: profile(userA.id, "Repository Integration"),
      currentSnapshot: empty,
      idempotencyKey: `repo-onboard-${randomUUID()}`,
    });
    initialA = onboarded.snapshot;
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
