import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { loadRecipeCardMetadata, setRecipeFavorite } from "./recipeCardMetadata";

const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;
const model = { asOfDate: "2026-10-12", recipes: [{ mealId: "meal", favorite: true, favoriteRevision: 3, usageCount: 4, popularRank: 1 }] };
const input = { mealId: "meal", favorite: true, expectedRevision: 2, asOfDate: model.asOfDate, idempotencyKey: "stable-intent" };
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: model, error: null }); });

describe("recipe-card repository boundary", () => {
  it("validates and returns the authoritative desired-state response", async () => {
    expect(await setRecipeFavorite(client, input)).toEqual(model);
    expect(rpc).toHaveBeenCalledWith("set_recipe_favorite", { p_payload: input });
    expect(await loadRecipeCardMetadata(client, model.asOfDate)).toEqual(model);
    expect(rpc).toHaveBeenLastCalledWith("get_recipe_card_metadata", { p_payload: { asOfDate: model.asOfDate } });
  });
  it("rejects invalid dates, versions, and malformed server metadata", async () => {
    await expect(loadRecipeCardMetadata(client, "2026-02-30")).rejects.toThrow();
    await expect(setRecipeFavorite(client, { ...input, expectedRevision: -1 })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: { ...model, recipes: [{ ...model.recipes[0], popularRank: 6 }] }, error: null });
    await expect(loadRecipeCardMetadata(client, model.asOfDate)).rejects.toThrow();
  });
  it.each([
    [{ code: "PGRST202", message: "missing RPC" }, /database update/],
    [{ message: "stale_version: changed" }, /Refresh the cards/],
    [{ message: "not_authenticated: expired" }, /Sign in again/],
    [{ message: "network error" }, /previous favorite state is retained/],
  ])("provides retryable feedback without inventing a persisted result", async (error, message) => {
    rpc.mockResolvedValue({ data: null, error });
    await expect(setRecipeFavorite(client, input)).rejects.toThrow(message);
  });
});
