import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { loadAppSnapshot } from "./supabaseSnapshot";

describe("recipe-time snapshot compatibility", () => {
  it("retains a retired recipe only when the current plan still references it", async () => {
    const rows = [
      { row_id: 1, app_id: "retired-planned", name: "Retired planned recipe", servings: 1, is_system: true, archived_at: "2026-10-12T00:00:00Z" },
      { row_id: 2, app_id: "retired-unused", name: "Retired unused recipe", servings: 1, is_system: true, archived_at: "2026-10-12T00:00:00Z" },
    ];
    const client = { from(table: string) {
      const data = table === "profiles" ? null : table === "meals" ? rows : table === "meal_plans" ? [{ row_id: 10, app_id: "plan", version: 1, week_of: "2026-10-12" }]
        : table === "planned_meals" ? [{ meal_plan_row_id: 10, app_id: "planned", meal_date: "2026-10-12", meal_slot: "lunch", meal_row_id: 1, food_row_id: null, servings: 1, label: "Retired planned recipe" }] : [];
      const result = Promise.resolve({ data, error: null });
      const query = { select: () => query, eq: () => query, or: () => query, order: () => query, gte: () => query, limit: () => query, maybeSingle: () => query, then: result.then.bind(result) };
      return query;
    } } as unknown as SupabaseClient<Database>;
    const snapshot = await loadAppSnapshot(client, "owner");
    expect(snapshot.savedMeals.map(meal => meal.id)).toEqual(["retired-planned"]);
    expect(snapshot.savedMeals[0].archivedAt).toBeDefined();
    expect(snapshot.mealPlan?.meals[0].mealId).toBe("retired-planned");
  });
  it("maps known time and zero while leaving null and older rows unspecified", async () => {
    const rows = [
      { app_id: "timed", total_time_minutes: 45, complexity: "easy" },
      { app_id: "zero", total_time_minutes: 0, complexity: "medium" },
      { app_id: "unknown", total_time_minutes: null, complexity: null },
      { app_id: "older" },
      { app_id: "url-cover", complexity: "hard", image: { kind: "url", url: "https://example.com/cover.webp" } },
      { app_id: "upload-cover", complexity: "invalid", image: { kind: "upload", path: "00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002.webp" } },
      { app_id: "bad-cover", image: { kind: "url", url: "javascript:alert(1)" } },
    ].map((row, index) => ({ row_id: index + 1, name: row.app_id, servings: 2, revision: 1, owner_user_id: "owner", ...row }));
    const client = { from(table: string) {
      const result = Promise.resolve({ data: table === "profiles" ? null : table === "meals" ? rows : [], error: null });
      const query = {
        select: () => query, eq: () => query, or: () => query, order: () => query,
        gte: () => query, limit: () => query, maybeSingle: () => query,
        then: result.then.bind(result),
      };
      return query;
    } } as unknown as SupabaseClient<Database>;
    const snapshot = await loadAppSnapshot(client, "owner");
    expect(snapshot.savedMeals.map(meal => [meal.id, meal.totalTimeMinutes])).toEqual([
      ["timed", 45], ["zero", 0], ["unknown", undefined], ["older", undefined],
      ["url-cover", undefined], ["upload-cover", undefined], ["bad-cover", undefined],
    ]);
    expect(snapshot.savedMeals[2]).not.toHaveProperty("totalTimeMinutes");
    expect(snapshot.savedMeals[3]).not.toHaveProperty("totalTimeMinutes");
    expect(snapshot.savedMeals[4].image).toEqual(rows[4].image);
    expect(snapshot.savedMeals[5].image).toEqual(rows[5].image);
    expect(snapshot.savedMeals[6]).not.toHaveProperty("image");
    expect(snapshot.savedMeals.map(meal => meal.complexity)).toEqual(["easy", "medium", undefined, undefined, "hard", undefined, undefined]);
  });
});
