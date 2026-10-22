import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppSnapshot } from "@/types/domain";
import NutritionPage from "./page";
import { FOODS } from "@/constants/foods";

let snapshot: AppSnapshot;
let weekLoading = false;
let weekError: string | undefined;
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot, actions: {} }) }));
vi.mock("@/components/nutrition/useNutritionWeek", () => ({ useNutritionWeek: (weekOf: string) => ({
  data: { weekOf, mealPlan: snapshot.mealPlan, targets: snapshot.nutritionWeekTargets, nutritionLogs: snapshot.nutritionLogs,
    loggedMeals: snapshot.loggedMeals, grocery: snapshot.grocery, recipes: [], foods: snapshot.foods }, loading: weekLoading, error: weekError, refresh: vi.fn(),
}) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 5, 12));
  weekLoading = false;
  weekError = undefined;
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
    expect(html).not.toContain('id="plan-saved-');
    expect(html).toContain('aria-label="Filter recipes"');
    expect(html).toContain('aria-label="Create"');
    expect(html.indexOf('aria-label="Filter recipes"')).toBeLessThan(html.indexOf('aria-label="Create"'));
    expect(html).not.toContain(" Create</button>");
    expect(html).toContain('aria-label="Generate"');
    expect(html).not.toContain(">Generate</button>");
    expect(html).toContain('aria-label="Edit No preparation"');
    expect(html).not.toContain('id="log-it-');
    expect(html).not.toContain(">Add to plan");
  });
  it("shows all four slots and keeps per-slot Add meal available without a plan", () => {
    const html = renderToStaticMarkup(<NutritionPage />);
    expect(html).toContain('aria-labelledby="planned-meals-heading"');
    expect(html.match(/aria-label="Add meal"/g)).toHaveLength(4);
    expect(html).not.toContain("> Add meal</button>");
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
      { id: "skipped-food", date: "2026-10-05", slot: "dinner", foodId: food.id, label: "Skipped food", servings: 1, skipped: true },
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
    expect(html).toMatch(/<button[^>]*bg-ink text-white[^>]*aria-label="Generate"[^>]*><svg[^>]*lucide-wand-sparkles/);
    expect(html).toMatch(/<button[^>]*bg-ink text-white[^>]*aria-label="Create"[^>]*><svg[^>]*lucide-plus/);
  });
  it("shows ordinary empty slots for missing references and unresolved recipes without changing the plan", () => {
    snapshot.foods = [FOODS[0]];
    snapshot.savedMeals = [
      { id: "missing-ingredient", name: "Incomplete recipe", servings: 1, ingredients: [{ foodId: "missing-ingredient-food", servings: 1 }] },
      { id: "empty-recipe", name: "Recipe without ingredients", servings: 1, ingredients: [] },
    ];
    snapshot.mealPlan = { id: "plan", version: 1, targetId: "target", weekOf: "2026-10-04", meals: [
      { id: "placeholder", date: "2026-10-05", slot: "breakfast", label: "Choose a meal", servings: 1 },
      { id: "missing-food", date: "2026-10-05", slot: "lunch", foodId: "unavailable-food", label: "Missing food", servings: 1 },
      { id: "missing-recipe", date: "2026-10-05", slot: "dinner", mealId: "unavailable-recipe", label: "Missing recipe", servings: 1, skipped: true },
      { id: "unavailable-ingredient", date: "2026-10-05", slot: "snack", mealId: "missing-ingredient", label: "Incomplete recipe", servings: 1 },
      { id: "empty-ingredients", date: "2026-10-05", slot: "dinner", mealId: "empty-recipe", label: "Recipe without ingredients", servings: 1 },
    ] };
    const original = structuredClone(snapshot);
    const html = renderToStaticMarkup(<NutritionPage />);
    const planned = html.slice(html.indexOf('aria-labelledby="planned-meals-heading"'), html.indexOf('aria-labelledby="saved-meals-heading"'));
    expect(planned.match(/Nothing planned or logged\./g)).toHaveLength(4);
    for (const text of ["Unresolved meal", "Choose a meal", "Missing food", "Missing recipe", "Incomplete recipe", "Recipe without ingredients", "Edit planned", "Plan again", "Nutrition unavailable", "log-planned-"]) expect(planned).not.toContain(text);
    for (const slot of ["breakfast", "lunch", "dinner", "snack"]) expect(planned).toContain(`id="add-meal-${slot}"`);
    expect(snapshot).toEqual(original);
  });
  it("keeps valid planned, skipped and eaten rows beside hidden unresolved rows without adding empty placeholders", () => {
    const food = FOODS[0];
    snapshot.foods = [food];
    snapshot.savedMeals = [{ id: "valid-recipe", name: "Available recipe", servings: 1, ingredients: [{ foodId: food.id, servings: 1 }] }];
    snapshot.mealPlan = { id: "plan", version: 1, targetId: "target", weekOf: "2026-10-04", meals: [
      ...(["breakfast", "lunch", "dinner", "snack"] as const).map(slot => ({ id: `missing-${slot}`, date: "2026-10-05", slot, mealId: "missing-recipe", label: "Unresolved meal", servings: 1 })),
      { id: "valid", date: "2026-10-05", slot: "lunch", mealId: "valid-recipe", label: "Available recipe", servings: 1 },
      { id: "skipped", date: "2026-10-05", slot: "snack", foodId: food.id, label: "Skipped food", servings: 1, skipped: true },
    ] };
    const actual = { date: "2026-10-05", customName: "Recorded food", servings: 1, calories: 100, proteinG: 10, carbsG: 15, fatG: 3, estimated: false, confidence: "high" as const, source: "user", valueSource: "user_provided" as const, createdAt: "2026-10-05T12:00:00Z" };
    snapshot.nutritionLogs = [{ ...actual, id: "standalone", slot: "breakfast" }, { ...actual, id: "ingredient", slot: "dinner", loggedMealId: "group" }];
    snapshot.loggedMeals = [{ id: "group", date: "2026-10-05", slot: "dinner", name: "Recorded meal", mealId: "missing-recipe", sourceMode: "saved_meal", revision: 1, createdAt: actual.createdAt }];
    const original = structuredClone(snapshot);
    const html = renderToStaticMarkup(<NutritionPage />);
    const planned = html.slice(html.indexOf('aria-labelledby="planned-meals-heading"'), html.indexOf('aria-labelledby="saved-meals-heading"'));
    for (const text of ["Available recipe", "Skipped food", "Plan again", "Recorded food", "Recorded meal", "100 kcal", "log-planned-valid", "log-planned-skipped"]) expect(planned).toContain(text);
    expect(planned).not.toContain("Unresolved meal");
    expect(planned).not.toContain("Nothing planned or logged.");
    expect(snapshot).toEqual(original);
  });
  it("does not present a loading or failed cached week as empty", () => {
    weekLoading = true;
    const loading = renderToStaticMarkup(<NutritionPage />);
    expect(loading).toContain("Loading this week’s nutrition");
    expect(loading).not.toContain("Nothing planned or logged.");
    weekLoading = false;
    weekError = "Weekly read failed";
    const failed = renderToStaticMarkup(<NutritionPage />);
    expect(failed).toContain("Weekly read failed");
    expect(failed).toContain("Retry week");
    expect(failed).not.toContain("Nothing planned or logged.");
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
