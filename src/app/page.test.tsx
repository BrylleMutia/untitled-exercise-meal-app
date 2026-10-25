import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppSnapshot, DailyStepEntry, NutritionLog, UserProfile } from "@/types/domain";
import HomePage from "./page";
import { TodayMealsCard } from "@/components/nutrition/TodayMealsCard";

let snapshot: AppSnapshot;
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot }) }));
vi.mock("@/components/nutrition/useNutritionWeek", () => ({ useNutritionWeek: () => ({ data: undefined, loading: false, refresh: vi.fn() }) }));

const profile: UserProfile = {
  id: "home-test", name: "Home Test", age: 30, sex: "female", heightCm: 168,
  weightKg: 68, units: "metric", weekStartsOn: 1, experience: "beginner", equipment: ["none"],
  daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions",
  allergies: [], notificationsEnabled: false, targetEligibility: "eligible", createdAt: "2026-10-05T08:00:00Z",
};

function step(overrides: Partial<DailyStepEntry> = {}): DailyStepEntry {
  return { date: "2026-10-05", steps: 6500, walkingMinutes: 35, source: "manual", revision: 1, updatedAt: "2026-10-05T08:00:00Z", ...overrides };
}

function renderHome() {
  return renderToStaticMarkup(<HomePage />);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 5, 12));
  snapshot = {
    schemaVersion: 1, userId: "home-test", onboarded: true, profile: { ...profile },
    foods: [], goal: null, target: null, nutritionWeekTargets: [], plan: null,
    workoutOverrides: [], mealPlan: null, sessions: [], nutritionLogs: [], loggedMeals: [],
    weights: [], grocery: null, savedMeals: [], progressionDecisions: [], dailySteps: [],
    customWorkouts: [], customSessions: [],
  };
});
afterEach(() => vi.useRealTimers());

describe("Home activity summaries", () => {
  it("shows all seven days, future restrictions and one workout card", () => {
    const html = renderHome();
    expect(html).toContain('aria-label="Daily step target is not set for Monday, October 5, 2026"');
    expect(html).toContain("No target");
    expect(html).toContain('id="home-steps-heading"');
    expect(html).toContain('>Steps</h2>');
    expect(html.match(/aria-pressed=/g)).toHaveLength(7);
    expect(html).toContain('>Today</span>');
    expect(html).not.toContain("This week&#x27;s steps");
    expect(html.match(/id="home-workouts-heading"/g)).toHaveLength(1);
    expect(html).not.toContain("home-workout-heading-desktop");
    expect(html).not.toContain("Your progress");
    expect(html).toContain('aria-label="Add steps for Monday, October 5, 2026"');
    expect(html).not.toContain('aria-label="Add steps for Tuesday, October 6, 2026"');
    expect(html.indexOf('id="home-meals-heading"')).toBeLessThan(html.indexOf('id="home-workouts-heading"'));
    expect(html.indexOf('id="home-workouts-heading"')).toBeLessThan(html.indexOf('id="home-steps-heading"'));
  });
  it.each([[0,"0%"],[6500,"81%"],[8000,"100%"],[12000,"100%"]])("retains saved %i steps and caps only the ring", (steps, percent) => {
    snapshot.profile = { ...profile, dailyStepTarget: 8000 };
    snapshot.dailySteps = [step({ steps: Number(steps) })];
    const html = renderHome();
    expect(html).toContain(`aria-label="Daily step target progress for Monday, October 5, 2026: ${percent}"`);
    expect(html).toContain(`${Number(steps).toLocaleString()} of 8,000 steps`);
    expect(html.includes("Target reached")).toBe(Number(steps) >= 8000);
    expect(html).toContain('aria-label="Edit steps for Monday, October 5, 2026"');
  });
  it("keeps unlogged intake and walking time explicit without fake zeros", () => {
    const html = renderHome();
    expect(html).toContain("Walking time not logged");
    expect(html).toContain("0 steps shown as a placeholder");
    expect(html).not.toContain("0 mins");
  });
  it.each([18,60])("preserves saved activity with unavailable estimates at age %i", age => {
    snapshot.profile = { ...profile, age }; snapshot.dailySteps = [step()];
    const html = renderHome();
    expect(html).toContain("6,500 steps"); expect(html).toContain("35 mins");
    expect(html).toContain("Energy unavailable for this profile");
  });
  it.each([undefined,0])("retains missing/zero walking minutes (%s)", walkingMinutes => {
    snapshot.dailySteps = [step({ walkingMinutes })];
    expect(renderHome()).toContain(walkingMinutes === undefined ? "Walking time not logged" : "0 mins");
    expect(renderHome()).toContain(walkingMinutes === undefined ? "Add walking minutes for an estimate" : "Energy unavailable for 0 minutes");
  });
  it("keeps workout energy unavailable or visibly approximate", () => {
    expect(renderHome()).toContain("Energy estimate: not logged.");
    snapshot.profile = { ...profile, targetEligibility: "unsupported" };
    expect(renderHome()).toContain("Energy estimate unavailable for this profile.");
    snapshot.profile = profile;
    snapshot.sessions = [{ id: "session", plannedWorkoutId: "workout", date: "2026-10-05", startedAt: "2026-10-05T08:00:00Z", finishedAt: "2026-10-05T08:30:00Z", status: "completed", logs: [] }];
    expect(renderHome()).toContain("≈130");
    expect(renderHome()).not.toContain("kcal this week");
  });
});

describe("Home meals summary states", () => {
  it.each([[449.4, "≈449 kcal"], [0, "≈0 kcal"], [NaN, "Calories unavailable"]])("uses one compact link for a long meal name and calories (%s)", (calories, text) => {
    const name = "Hainanese Chicken Rice with a long saved meal name";
    snapshot.nutritionLogs = [{ id: "meal", date: "2026-10-05", slot: "dinner", customName: name, servings: 1, calories: Number(calories), proteinG: 28, carbsG: 61, fatG: 30, estimated: true, confidence: "high", source: "test", valueSource: "user_provided", createdAt: "2026-10-05T08:00:00Z" }];
    const html = renderToStaticMarkup(<TodayMealsCard />);
    const link = html.match(/<a[^>]*aria-label="View logged [^"]*"[^>]*>[^]*?<\/a>/)?.[0];
    expect(link).toContain(name); expect(link).toContain(text);
    expect(link).toContain("min-h-11"); expect(link).toContain("flex-col justify-center");
    expect(html).not.toContain("data-nutrition-metric"); expect(html).not.toContain("Scroll horizontally");
  });
  it("uses the same statistic value sizing for known and description-bearing values", () => {
    const html = renderHome();
    const classes = [...html.matchAll(/<dd[^>]*class="([^"]*)"/g)].map(match => match[1]);
    expect(classes).toHaveLength(6); expect(new Set(classes).size).toBe(1);
    expect(classes[0]).toContain("leading-5"); expect(classes[0]).not.toContain("min-h-");
  });
  it.each([
    { count: 0, calories: 0, estimated: false, caption: "Not logged", summary: "No meals logged; intake is unknown" },
    { count: 1, calories: 0, estimated: false, caption: "Still logging", summary: "2000 kcal remaining from the estimated target" },
    { count: 1, calories: 500, estimated: true, caption: "Still logging", summary: "Approximately 1500 kcal remaining from the estimated target" },
    { count: 4, calories: 250, estimated: false, caption: "Daily estimate", summary: "1000 kcal remaining from the estimated target" },
    { count: 4, calories: 600, estimated: false, caption: "≈400 kcal above estimate", summary: "About 400 kcal above the estimated target" },
  ])("preserves $summary in the compact macro layout", ({ count, calories, estimated, caption, summary }) => {
    snapshot.nutritionWeekTargets = [{
      id: "nutrition-target", version: 1, effectiveDate: "2026-10-05", calories: 2000,
      proteinG: 144, carbsG: 366, fatG: 76, bmr: 1400, bmi: 24, tdee: 2000,
      formula: "test", activityFactor: 1.4, disclaimer: "Estimate",
    }];
    snapshot.nutritionLogs = (["breakfast", "lunch", "dinner", "snack"] as const).slice(0, count).map((slot): NutritionLog => ({
      id: slot, date: "2026-10-05", slot, servings: 1, calories,
      proteinG: calories === 0 ? 0 : 10, carbsG: 20, fatG: 5,
      estimated, confidence: "high", source: "test", valueSource: "user_provided", createdAt: "2026-10-05T08:00:00Z",
    }));
    const html = renderToStaticMarkup(<TodayMealsCard />);
    expect(html).toContain(`aria-label="${summary}"`);
    expect(html).not.toContain(`>${caption}</span>`);
    expect(html).not.toContain("No meals logged yet");
    expect(html.match(/aria-label="Undo logged /g) ?? []).toHaveLength(count);
    expect(html).not.toContain(">Logged</span>");
    expect(html.replace(/<[^>]*>/g, " ")).not.toMatch(/\b\d+ meals? logged\b/);
    expect(html).toContain('aria-label="Protein"');
    expect(html).toContain(count === 0 ? 'aria-valuetext="No entry logged"' : `aria-valuenow="${calories === 0 ? 0 : count * 10}"`);
  });

  it("keeps logging available when daily targets are missing", () => {
    const html = renderHome();
    expect(html).toContain("Daily targets aren&#x27;t set yet. You can still log meals.");
    expect(html).toContain('aria-label="No calorie target set"');
    for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"]) expect(html).toContain(`aria-label="Add meal to ${slot}"`);
  });
});

describe("Home compact workout summary", () => {
  it("retains rest-day copy and navigation", () => {
    const html = renderHome();
    expect(html).toContain("Rest day — no workout scheduled.");
    expect(html).toContain("View weekly workouts");
  });

  it("retains the prescribed workout, start destination, and progression explanation", () => {
    snapshot.plan = {
      id: "plan", version: 1, createdAt: "2026-10-05T08:00:00Z", targetId: "target",
      workouts: [{ id: "workout", dayOfWeek: 1, title: "Push + Core", focus: "Chest and core", warmup: [], cooldown: [],
        estimatedMinutes: 28, exercises: [{ id: "planned-push", exerciseId: "ex-push-up", sets: 3, reps: 10, restSeconds: 60 }] }],
    };
    snapshot.sessions = ["2026-10-04", "2026-10-02"].map((date) => ({
      id: date, plannedWorkoutId: "workout", date, startedAt: `${date}T08:00:00Z`, finishedAt: `${date}T08:30:00Z`, status: "completed",
      logs: [{ exerciseId: "ex-push-up", planned: { sets: 3, reps: 10 }, actual: { sets: 3, reps: 10 }, status: "completed", rpe: 6 }],
    }));
    const html = renderHome();
    expect(html).toContain("Push + Core");
    expect(html).toContain("Chest and core");
    expect(html).toContain('href="/workouts/session/workout"');
    expect(html).toContain('aria-label="Start workout"');
    expect(html).toContain("Two manageable sessions in a row");
  });
});
