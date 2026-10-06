import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { AppSnapshot, UserProfile } from "@/types/domain";
import { createSupabaseRepository } from "./supabaseRepository";

const { loadSnapshot } = vi.hoisted(() => ({ loadSnapshot: vi.fn() }));
vi.mock("./supabaseSnapshot", () => ({ loadAppSnapshot: loadSnapshot, loadHistoryReadModel: vi.fn() }));

const profile: UserProfile = {
  id: "owner", name: "Test", age: 30, sex: "female", heightCm: 168, weightKg: 68,
  units: "metric", experience: "beginner", equipment: ["none"], daysPerWeek: 3,
  sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [],
  notificationsEnabled: false, targetEligibility: "unsupported", revision: 4, createdAt: "2026-10-05T08:00:00Z",
};
let snapshot: AppSnapshot;
const rpc = vi.fn();
const checkColumn = vi.fn();
const select = vi.fn(() => ({ limit: checkColumn }));
const client = {
  rpc,
  from: vi.fn(() => ({ select })),
  auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "owner" } }, error: null })) },
} as unknown as SupabaseClient<Database>;
const repository = createSupabaseRepository(client);

beforeEach(() => {
  vi.clearAllMocks();
  snapshot = {
    schemaVersion: 1, userId: "owner", onboarded: true, profile: { ...profile },
    foods: [], goal: null, target: null, nutritionWeekTargets: [], plan: null, workoutOverrides: [],
    mealPlan: null, sessions: [], nutritionLogs: [], loggedMeals: [], weights: [], grocery: null,
    savedMeals: [], progressionDecisions: [], dailySteps: [], customWorkouts: [], customSessions: [],
  };
  loadSnapshot.mockImplementation(async () => snapshot);
  checkColumn.mockResolvedValue({ error: null, status: 200 });
  rpc.mockResolvedValue({ data: { result_refs: {} }, error: null, status: 200 });
});

describe("daily step target repository intent", () => {
  it.each([0, -1, 1.5, Number.NaN, Infinity, 200001])("rejects invalid target %s before persistence", async (target) => {
    await expect(repository.setDailyStepTarget({ target, expectedRevision: 4, idempotencyKey: "intent" }))
      .rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
    expect(rpc).not.toHaveBeenCalled();
    expect(checkColumn).not.toHaveBeenCalled();
  });

  it("sends a nullable target and the original revision and retry key, then uses refreshed state", async () => {
    snapshot.profile = { ...profile, dailyStepTarget: 8000, revision: 5 };
    const outcome = await repository.setDailyStepTarget({ target: 8000, expectedRevision: 4, idempotencyKey: "same-intent" });
    expect(rpc).toHaveBeenCalledWith("set_daily_step_target", { p_payload: { target: 8000, expectedRevision: 4, idempotencyKey: "same-intent" } });
    expect(outcome.snapshot).toBe(snapshot);
    expect(outcome.events).toEqual([{ type: "profile-updated" }]);
    await repository.setDailyStepTarget({ target: null, expectedRevision: 5, idempotencyKey: "clear-intent" });
    expect(rpc).toHaveBeenLastCalledWith("set_daily_step_target", { p_payload: { target: null, expectedRevision: 5, idempotencyKey: "clear-intent" } });
  });

  it.each([0, 1.5, Number.NaN, 2147483648])("rejects invalid expected revision %s", async (expectedRevision) => {
    await expect(repository.setDailyStepTarget({ target: 8000, expectedRevision })).rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not send a mutation to an unmigrated database or silently discard an onboarding choice", async () => {
    checkColumn.mockResolvedValue({ error: { code: "42703", message: "column daily_step_target does not exist" }, status: 400 });
    await expect(repository.setDailyStepTarget({ target: 8000, expectedRevision: 4 })).rejects.toThrow(/database update must be rolled out first/);
    await expect(repository.completeOnboarding({ profile: { ...profile, dailyStepTarget: 8000 }, currentSnapshot: snapshot })).rejects.toThrow(/draft is retained/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("serializes a skipped onboarding target as an explicit clear", async () => {
    await repository.completeOnboarding({ profile, currentSnapshot: snapshot, idempotencyKey: "onboard" });
    expect(rpc.mock.calls[0][1].p_payload.profile.dailyStepTarget).toBeNull();
    expect(rpc.mock.calls[0][0]).toBe("complete_onboarding");
  });

  it("preserves omission on unrelated profile updates and avoids plan generation", async () => {
    snapshot.profile = { ...profile, dailyStepTarget: 8000 };
    await repository.updateProfile({ profile: { ...profile, name: "Edited" }, currentSnapshot: snapshot, idempotencyKey: "name-only" });
    const payload = rpc.mock.calls[0][1].p_payload;
    expect(payload.profile.dailyStepTarget).toBeUndefined();
    expect(payload.profileOnly).toBe(true);
    expect(payload.plan).toBeUndefined();
    expect(payload.target).toBeUndefined();
  });

  it("propagates failures without publishing refreshed or optimistic state", async () => {
    rpc.mockResolvedValue({ error: { message: "retryable: network failure" }, status: 503 });
    await expect(repository.setDailyStepTarget({ target: 8000, expectedRevision: 4 })).rejects.toMatchObject({ repositoryError: { code: "retryable" } });
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(snapshot.profile?.dailyStepTarget).toBeUndefined();
  });
});
