import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { AppSnapshot } from "@/types/domain";
import { createSupabaseRepository } from "./supabaseRepository";

const { loadSnapshot } = vi.hoisted(() => ({ loadSnapshot: vi.fn() }));
vi.mock("./supabaseSnapshot", () => ({ loadAppSnapshot: loadSnapshot, loadHistoryReadModel: vi.fn() }));
const snapshot: AppSnapshot = {
  schemaVersion: 1, userId: "owner", onboarded: false, profile: null, foods: [],
  goal: null, target: null, nutritionWeekTargets: [], plan: null, workoutOverrides: [],
  mealPlan: null, sessions: [], nutritionLogs: [], loggedMeals: [], weights: [], grocery: null,
  savedMeals: [], progressionDecisions: [], dailySteps: [], customWorkouts: [], customSessions: [],
};
const rpc = vi.fn();
const checkColumn = vi.fn();
const client = {
  rpc, from: vi.fn(() => ({ select: vi.fn(() => ({ limit: checkColumn })) })),
  auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "owner" } }, error: null })) },
} as unknown as SupabaseClient<Database>;
const repository = createSupabaseRepository(client);
const input = { meal: { complexity: "easy" as const, id: "recipe", name: "Recipe", notes: "Stir and serve.", reference: "Cookbook page 4", servings: 1, ingredients: [{ foodId: "food-egg", servings: 1 }] }, newFoods: [], currentSnapshot: snapshot, expectedVersions: { recordRevision: 2 }, idempotencyKey: "stable-recipe-intent" };

beforeEach(() => {
  vi.clearAllMocks();
  checkColumn.mockResolvedValue({ error: null, status: 200 });
  rpc.mockResolvedValue({ data: { result_refs: {} }, error: null, status: 200 });
  loadSnapshot.mockResolvedValue(snapshot);
});

describe("recipe repository intent", () => {
  it("omits grocery writes and grocery revisions for unchanged canonical recipe quantities", async () => {
    const currentSnapshot = { ...snapshot, savedMeals: [{ ...input.meal, revision: 2 }], grocery: { id: "grocery", weekOf: "2026-10-12", revision: 4, items: [] } };
    const expectedVersions = { recordRevision: 2, groceryRevision: 4 };
    const outcome = await repository.saveRecipe({ ...input, meal: { ...input.meal, ingredients: [{ foodId: "food-egg", servings: 1, cookingMeasurement: { kind: "amount", quantity: 0.5, unit: "cup", gramsPerUnit: 100 } }] }, currentSnapshot, expectedVersions });
    const payload = rpc.mock.calls[0][1].p_payload;
    expect(payload).not.toHaveProperty("grocery"); expect(payload.expectedVersions).toEqual({ recordRevision: 2 });
    expect(expectedVersions).toEqual({ recordRevision: 2, groceryRevision: 4 });
    expect(outcome.events).toEqual([{ type: "meal-saved", mealId: input.meal.id }]);
  });
  it("sends catalog identity and separate concurrency version with a new personal identity", async () => {
    const catalog = { mealId: "meal-korean-beef-bowl", recordRevision: 1, preferenceRevision: 0 };
    await repository.saveRecipe({ ...input, catalog });
    expect(rpc).toHaveBeenLastCalledWith("save_recipe", { p_payload: expect.objectContaining({ catalog, meal: expect.objectContaining({ id: "recipe" }), idempotencyKey: input.idempotencyKey }) });
  });
  it("does not silently create a copy when an older backend lacks catalog controls", async () => {
    checkColumn.mockResolvedValueOnce({ error: null, status: 200 }).mockResolvedValueOnce({ error: { code: "PGRST205", message: "Missing table" }, status: 404 });
    await expect(repository.saveRecipe({ ...input, catalog: { mealId: "meal-korean-beef-bowl", recordRevision: 1, preferenceRevision: 0 } })).rejects.toThrow(/Your draft is retained/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("archives a catalog recipe through the authorized RPC with its preference version", async () => {
    await repository.archiveMeal({ mealId: "catalog", currentSnapshot: { ...snapshot, savedMeals: [{ ...input.meal, id: "catalog", isSystem: true, revision: 1, catalogPreferenceRevision: 2 }] }, idempotencyKey: "catalog-archive" });
    expect(rpc).toHaveBeenLastCalledWith("archive_saved_meal", { p_payload: expect.objectContaining({ mealId: "catalog", catalogPreferenceRevision: 2, expectedVersions: { recordRevision: 1 } }) });
  });
  it.each(["easy", "medium", "hard"] as const)("persists manually selected %s complexity", async complexity => {
    await repository.saveRecipe({ ...input, meal: { ...input.meal, complexity } });
    expect(rpc).toHaveBeenLastCalledWith("save_recipe", { p_payload: expect.objectContaining({ meal: expect.objectContaining({ complexity }) }) });
  });
  it("requires complexity for authoring while preserving legacy saved-meal compatibility", async () => {
    const legacy = { ...input, meal: { ...input.meal, complexity: undefined } };
    await expect(repository.saveRecipe(legacy)).rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
    expect(rpc).not.toHaveBeenCalled();
    await repository.saveMeal(legacy);
    expect(rpc).toHaveBeenLastCalledWith("save_saved_meal", { p_payload: expect.objectContaining({ meal: legacy.meal }) });
  });
  it("rejects unsupported complexity and prevents an older backend from dropping it", async () => {
    const invalid = { ...input, meal: { ...input.meal, complexity: "expert" as "easy" } };
    await expect(repository.saveRecipe(invalid)).rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
    await expect(repository.saveMeal(invalid)).rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
    expect(rpc).not.toHaveBeenCalled();
    checkColumn.mockResolvedValue({ error: { code: "42703", message: "column meals.complexity does not exist" }, status: 400 });
    await expect(repository.saveMeal(input)).rejects.toThrow(/Your draft is retained/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("persists URL, uploaded and explicit default cover choices through the authorized intent", async () => {
    for (const image of [{ kind: "url" as const, url: "https://example.com/cover.webp" }, { kind: "upload" as const, path: "00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp" }, null]) {
      await repository.saveRecipe({ ...input, meal: { ...input.meal, image } });
      expect(rpc).toHaveBeenLastCalledWith("save_recipe", { p_payload: expect.objectContaining({ meal: expect.objectContaining({ image }), idempotencyKey: input.idempotencyKey }) });
    }
  });
  it("blocks image saves on an older backend before mutation or snapshot publication", async () => {
    checkColumn.mockResolvedValueOnce({ error: { code: "42703", message: "column meals.image does not exist" }, status: 400 });
    await expect(repository.saveRecipe({ ...input, meal: { ...input.meal, image: null } })).rejects.toThrow(/Your draft is retained/);
    expect(rpc).not.toHaveBeenCalled(); expect(loadSnapshot).not.toHaveBeenCalled();
  });
  it("keeps recipe details, revisions and the retry key in the authorized save payload", async () => {
    const outcome = await repository.saveRecipe(input);
    expect(rpc).toHaveBeenCalledWith("save_recipe", { p_payload: { meal: { ...input.meal, totalTimeMinutes: null }, newFoods: [], grocery: null, expectedVersions: input.expectedVersions, idempotencyKey: input.idempotencyKey } });
    expect(outcome.snapshot).toBe(snapshot);
  });
  it("rejects blank instructions before making a request", async () => {
    await expect(repository.saveRecipe({ ...input, meal: { ...input.meal, notes: " " } })).rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
    expect(checkColumn).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([0, 30, 2147483647])("saves total time %s without changing the retry identity", async totalTimeMinutes => {
    await repository.saveRecipe({ ...input, meal: { ...input.meal, totalTimeMinutes } });
    expect(rpc).toHaveBeenCalledWith("save_recipe", { p_payload: expect.objectContaining({ meal: { ...input.meal, totalTimeMinutes }, idempotencyKey: input.idempotencyKey }) });
  });
  it.each([-1, 1.5, NaN, Infinity, 2147483648])("rejects invalid time %s in both save paths", async totalTimeMinutes => {
    const invalid = { ...input, meal: { ...input.meal, totalTimeMinutes } };
    await expect(repository.saveRecipe(invalid)).rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
    await expect(repository.saveMeal(invalid)).rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
    expect(rpc).not.toHaveBeenCalled();
    expect(checkColumn).not.toHaveBeenCalled();
  });
  it("preserves omitted legacy time and carries duplicate recipe time through saved-meal saves", async () => {
    await repository.saveMeal(input);
    expect(rpc).toHaveBeenLastCalledWith("save_saved_meal", { p_payload: expect.objectContaining({ meal: input.meal }) });
    await repository.saveMeal({ ...input, meal: { ...input.meal, id: "recipe-copy", totalTimeMinutes: 45 } });
    expect(rpc).toHaveBeenLastCalledWith("save_saved_meal", { p_payload: expect.objectContaining({ meal: { ...input.meal, id: "recipe-copy", totalTimeMinutes: 45 } }) });
  });
  it("retains drafts instead of silently saving through an older backend", async () => {
    checkColumn.mockResolvedValue({ error: { code: "42703", message: "column meals.reference does not exist" }, status: 400 });
    await expect(repository.saveRecipe(input)).rejects.toThrow(/Your draft is retained/);
    expect(rpc).not.toHaveBeenCalled();
    expect(loadSnapshot).not.toHaveBeenCalled();
  });
  it("propagates failed saves without publishing optimistic or refreshed data", async () => {
    rpc.mockResolvedValue({ error: { message: "retryable: network failure" }, status: 503 });
    await expect(repository.saveRecipe(input)).rejects.toMatchObject({ repositoryError: { code: "retryable" } });
    expect(loadSnapshot).not.toHaveBeenCalled();
  });
});
