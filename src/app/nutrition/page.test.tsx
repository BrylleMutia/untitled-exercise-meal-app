import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppSnapshot } from "@/types/domain";
import NutritionPage from "./page";

let snapshot: AppSnapshot;
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot, actions: {} }) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 5, 12));
  snapshot = {
    schemaVersion: 1, userId: "nutrition-test", onboarded: true, profile: null,
    foods: [], goal: null, target: null, nutritionWeekTargets: [], plan: null,
    workoutOverrides: [], mealPlan: null, sessions: [], nutritionLogs: [], loggedMeals: [],
    weights: [], grocery: null, savedMeals: [], progressionDecisions: [], dailySteps: [],
    customWorkouts: [], customSessions: [],
  };
});

afterEach(() => vi.useRealTimers());

describe("Nutrition day slots", () => {
  it("shows explicit recipe time, including zero, without inventing time for older meals", () => {
    snapshot.savedMeals = [
      { id: "zero", name: "No preparation", servings: 1, ingredients: [], totalTimeMinutes: 0 },
      { id: "timed", name: "Prepared recipe", servings: 2, ingredients: [], totalTimeMinutes: 45 },
      { id: "legacy", name: "Older recipe", servings: 1, ingredients: [] },
    ];
    const html = renderToStaticMarkup(<NutritionPage />);
    expect(html).toContain("0 mins total</span>");
    expect(html).toContain("45 mins total</span>");
    expect(html.match(/mins total/g)).toHaveLength(2);
  });
  it("shows all four slots and keeps Add to plan available without a plan", () => {
    const html = renderToStaticMarkup(<NutritionPage />);
    expect(html).toContain('aria-labelledby="planned-meals-heading"');
    expect(html).toContain("Add to plan");
    for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
      expect(html).toContain(`aria-label="${slot}"`);
      expect(html).toContain(`Nothing planned or logged for ${slot.toLowerCase()}. Intake is unknown.`);
    }
    expect(html).toContain("Set an eligible daily goal to add to the plan. You can still log food you ate.");
    expect(html).not.toContain("Meals for this day");
    expect(html).not.toContain('aria-label="Logged"');
  });
});
