import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { loadIngredientConversions } from "./ingredientConversions";

function client(data: unknown, error: unknown = null) {
  const rpc = vi.fn(() => ({ abortSignal: vi.fn().mockResolvedValue({ data, error }) }));
  return { rpc, value: { rpc } as unknown as SupabaseClient<Database> };
}
const candidate = { foodId: "food", unit: "cup", gramsPerUnit: 80, source: { kind: "personal", recipeName: "Saved recipe" } };
describe("conversion read repository", () => {
  it("validates and deduplicates requested foods and returns typed candidates", async () => {
    const api = client([candidate]);
    expect(await loadIngredientConversions(api.value, ["food", "food"])).toEqual([candidate]);
    expect(api.rpc).toHaveBeenCalledWith("get_ingredient_conversions", { p_food_ids: ["food"] });
  });
  it("keeps no-food reads local and rejects oversized requests", async () => {
    const api = client([]);
    expect(await loadIngredientConversions(api.value, [])).toEqual([]);
    await expect(loadIngredientConversions(api.value, Array.from({ length: 101 }, (_, i) => `food-${i}`))).rejects.toThrow();
    expect(api.rpc).not.toHaveBeenCalled();
  });
  it("rejects mismatched, invalid, and failed responses with manual recovery available", async () => {
    for (const data of [[{ ...candidate, foodId: "other" }], [{ ...candidate, gramsPerUnit: -1 }], {}]) {
      await expect(loadIngredientConversions(client(data).value, ["food"])).rejects.toThrow();
    }
    await expect(loadIngredientConversions(client(null, { message: "offline" }).value, ["food"])).rejects.toThrow("manually");
  });
});
