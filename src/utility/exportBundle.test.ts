import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildAccountExportZip, toCsv } from "./exportBundle";

describe("account export bundle", () => {
  it("escapes CSV values and preserves nested values", () => {
    expect(toCsv([
      { name: "A, B", note: "line 1\nline 2", tags: ["one", "two"] },
    ])).toBe('name,note,tags\r\n"A, B","line 1\nline 2","[""one"",""two""]"\r\n');
  });

  it("creates a lossless JSON plus entity CSV ZIP", () => {
    const zip = buildAccountExportZip({
      profile: { name: "Test" },
      nutritionLogs: [{ id: "n-1", calories: 10 }],
      foods: [{ id: "food-1", source: "USDA FoodData Central", valueSource: "trusted_catalog" }],
      exportedAt: "2026-09-22T00:00:00.000Z",
      goals: [],
      dailyTargets: [],
      workoutPlans: [],
      plannedWorkouts: [],
      plannedExercises: [],
      workoutPlanOverrides: [],
      mealPlans: [],
      plannedMeals: [],
      workoutSessions: [],
      exerciseLogs: [],
      weightEntries: [],
      groceryLists: [],
      groceryItems: [],
      savedMeals: [],
      savedMealIngredients: [],
      loggedMeals: [],
    }, "2026-09-22T00:00:00.000Z");
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual([
      "dailyTargets.csv",
      "exerciseLogs.csv",
      "foods.csv",
      "goals.csv",
      "groceryItems.csv",
      "groceryLists.csv",
      "loggedMeals.csv",
      "mealPlans.csv",
      "metadata.csv",
      "nutritionLogs.csv",
      "plannedExercises.csv",
      "plannedMeals.csv",
      "plannedWorkouts.csv",
      "savedMealIngredients.csv",
      "savedMeals.csv",
      "export.json",
      "manifest.json",
      "weightEntries.csv",
      "workoutPlanOverrides.csv",
      "workoutPlans.csv",
      "workoutSessions.csv",
    ].sort());
    expect(JSON.parse(strFromU8(files["export.json"])).profile.name).toBe("Test");
    expect(strFromU8(files["nutritionLogs.csv"])).toContain("id,calories");
    expect(JSON.parse(strFromU8(files["manifest.json"])).schemaVersion).toBe(1);
  });
});
