import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppSnapshot } from "@/types/domain";
import NutritionPage from "./page";
import { FOODS } from "@/constants/foods";

let snapshot: AppSnapshot;
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot, actions: {} }) }));
vi.mock("@/components/nutrition/useNutritionWeek", () => ({ useNutritionWeek: (weekOf: string) => ({
  data: { weekOf, mealPlan: snapshot.mealPlan, targets: snapshot.nutritionWeekTargets, nutritionLogs: snapshot.nutritionLogs,
    loggedMeals: snapshot.loggedMeals, grocery: snapshot.grocery, recipes: [], foods: snapshot.foods }, loading: false, refresh: vi.fn(),
}) }));

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
    expect(html).toContain("0 mins</span>");
    expect(html).toContain("45 mins</span>");
    expect(html.match(/Total recipe time:/g)).toHaveLength(2);
    expect(html.match(/id="plan-saved-/g)).toHaveLength(3);
    expect(html).not.toContain('id="log-it-');
    expect(html).toContain("Add to plan");
  });
  it("shows all four slots and keeps per-slot Add meal available without a plan", () => {
    const html = renderToStaticMarkup(<NutritionPage />);
    expect(html).toContain('aria-labelledby="planned-meals-heading"');
    expect(html.split("> Add meal</button>")).toHaveLength(5);
    expect(html).not.toContain("add-to-plan-action");
    for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
      expect(html).toContain(`aria-label="${slot}"`);
      expect(html).toContain(`id="add-meal-${slot.toLowerCase()}"`);
    }
    expect(html.match(/Nothing planned or logged\./g)).toHaveLength(4);
    expect(html).toContain("Set an eligible daily goal to add to the plan. You can still log food you ate.");
    expect(html).not.toContain("Meals for this day");
    expect(html).not.toContain('aria-label="Logged"');
  });
  it("uses compact Planned and Eaten rows while retaining Saved recipe cards", () => {
    const food = FOODS[0];
    snapshot.savedMeals = [{ id: "beef", name: "Beef bowl", servings: 4, ingredients: [{ foodId: food.id, servings: 1 }], providedNutrition: { calories: 560, proteinG: 45, carbsG: 58, fatG: 16 } }];
    snapshot.mealPlan = { id: "plan", version: 1, targetId: "target", weekOf: "2026-10-05", meals: [
      { id: "beef-plan", date: "2026-10-05", slot: "lunch", mealId: "beef", label: "Beef bowl", servings: 0.5, expectedCalories: 280, expectedProteinG: 22.5, expectedCarbsG: 29, expectedFatG: 8 },
      { id: "unresolved", date: "2026-10-05", slot: "dinner", label: "Choose a meal", servings: 1, skipped: true, expectedCalories: 0 },
    ] };
    snapshot.nutritionLogs = [{ id: "eaten", date: "2026-10-05", slot: "lunch", customName: "Eaten food", servings: 1, calories: 100, proteinG: 10, carbsG: 15, fatG: 3, estimated: false, confidence: "high", source: "user", valueSource: "user_provided", createdAt: "2026-10-05T12:00:00Z" }];
    const html = renderToStaticMarkup(<NutritionPage />);
    const plannedHtml = html.slice(html.indexOf('aria-labelledby="planned-meals-heading"'), html.indexOf('aria-labelledby="saved-meals-heading"'));
    expect(plannedHtml).toContain("Planned portion nutrition");
    expect(plannedHtml).toContain("≈280 kcal");
    expect(plannedHtml).toContain("0.5 servings");
    expect(plannedHtml).toContain("Eaten food");
    expect(plannedHtml).toContain("100 kcal");
    expect(plannedHtml).toContain("Plan again");
    expect(plannedHtml).toContain("Nutrition unavailable");
    expect(plannedHtml).not.toContain("recipe-card");
    expect(plannedHtml).not.toContain("recipe-default.png");
    expect(plannedHtml).not.toContain("favorites:");
    expect(plannedHtml).not.toContain("Recipe yields");
    expect(html).toContain("View recipe image: Beef bowl");
    expect(html).toContain("Recipe yields 4 servings");
    expect(html).toContain('id="saved-meals-heading" class="font-extrabold">Recipes</h2>');
    expect(html).toContain('aria-label="About Recipes"');
    expect(html).not.toContain('aria-label="About Saved meals"');
    expect(html).toMatch(/<button[^>]*bg-ink text-white[^>]*><svg[^>]*lucide-wand-sparkles[^>]*aria-hidden="true"[\s\S]*?<\/svg>Generate<\/button>/);
    expect(html).toMatch(/<button[^>]*bg-white\/70 text-ink[^>]*><svg[^>]*lucide-plus[^>]*aria-hidden="true"[\s\S]*?<\/svg> Create<\/button>/);
  });
  it("places Today between the week arrows, counts Eaten rows, and omits Log again", () => {
    const food = FOODS[0];
    snapshot.mealPlan = { id: "plan", version: 1, targetId: "target", weekOf: "2026-10-05", meals: [{ id: "linked", date: "2026-10-05", slot: "lunch", foodId: food.id, label: food.name, servings: 1 }] };
    snapshot.nutritionLogs = [{ id: "actual", date: "2026-10-05", slot: "lunch", foodId: food.id, plannedMealId: "linked", servings: 1, calories: 100, proteinG: 10, carbsG: 15, fatG: 3, estimated: false, confidence: "high", source: "user", valueSource: "user_provided", createdAt: "2026-10-05T12:00:00Z" }];
    const html = renderToStaticMarkup(<NutritionPage />);
    expect(html.indexOf('aria-label="Previous week"')).toBeLessThan(html.indexOf(">Today</button>"));
    expect(html.indexOf(">Today</button>")).toBeLessThan(html.indexOf('aria-label="Next week"'));
    expect(html.indexOf('aria-label="Next week"')).toBeLessThan(html.indexOf('aria-label="Nutrition summary view"'));
    expect(html.indexOf(">Today</button>")).toBeLessThan(html.indexOf('aria-label="Choose a day"'));
    expect(html).not.toContain("Log again");
    expect(html).toContain(`aria-label="Edit ${food.name}"`);
    expect(html).toContain("1 meal eaten");
    snapshot.nutritionLogs.push({ ...snapshot.nutritionLogs[0], id: "another", servings: 2 });
    expect(renderToStaticMarkup(<NutritionPage />)).toContain("2 meals eaten");
    snapshot.loggedMeals = [{ id: "group", date: "2026-10-05", slot: "lunch", name: "Mixed meal", mealId: "recipe", sourceMode: "saved_meal", revision: 1, createdAt: "2026-10-05T12:00:00Z" }];
    snapshot.nutritionLogs = snapshot.nutritionLogs.map(log => ({ ...log, loggedMealId: "group" }));
    expect(renderToStaticMarkup(<NutritionPage />)).toContain("1 meal eaten");
    snapshot.nutritionLogs = [];
    snapshot.loggedMeals = [];
    const empty = renderToStaticMarkup(<NutritionPage />);
    expect(empty).toContain("No meals eaten");
    expect(empty).toContain(">Not logged</span>");
    expect(empty).not.toContain("Partially logged — missing slots are not zero");
  });
});
