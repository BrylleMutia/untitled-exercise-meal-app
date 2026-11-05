import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import type { GroupPlanningInput } from "@/types/cookingGroup";
import { cookingGroupRepository } from "./cookingGroupRepository";

const input: GroupPlanningInput = { groupId: "group", weekOf: "2026-10-11", memberIds: ["me"], selectedDates: ["2026-10-14"], mode: "fill", recipes: [], seed: "test", overrides: {} };
function repository(data: unknown) {
  const invoke = vi.fn().mockResolvedValue({ data, error: null });
  return { repository: cookingGroupRepository({ functions: { invoke } } as unknown as SupabaseClient<Database>), invoke };
}
describe("complete group preview response", () => {
  it("rejects legacy partial-day responses instead of presenting an incomplete day", async () => {
    await expect(repository({ assignments: [] }).repository.preview(input)).rejects.toThrow("complete daily preview is unavailable");
  });
  it("requires every returned row to belong to the requested people and dates", async () => {
    const row = { id: "meal", memberId: "other", date: input.selectedDates[0], status: "kept" };
    await expect(repository({ resultingMeals: [row] }).repository.preview(input)).rejects.toThrow("could not be verified");
    await expect(repository({ resultingMeals: [{ ...row, memberId: "me", date: "2026-10-15" }] }).repository.preview(input)).rejects.toThrow("could not be verified");
  });
  it("accepts an explicit empty resulting day and forwards only the planning intent", async () => {
    const { repository: repo, invoke } = repository({ assignments: [], resultingMeals: [] });
    expect((await repo.preview(input)).resultingMeals).toEqual([]);
    expect(invoke).toHaveBeenCalledWith("cooking-group-preview", { body: input });
  });
});
