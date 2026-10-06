import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AppSnapshot, DailyStepEntry, NutritionLog, UserProfile } from "@/types/domain";
import HomePage from "./page";

let snapshot: AppSnapshot;
vi.mock("@/contexts/AppContext", () => ({ useApp: () => ({ snapshot }) }));

const profile: UserProfile = {
  id: "home-test", name: "Home Test", age: 30, sex: "female", heightCm: 168,
  weightKg: 68, units: "metric", experience: "beginner", equipment: ["none"],
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

describe("Home saved steps summary", () => {
  it("shows an unavailable ring for legacy profiles without a target", () => {
    const html = renderHome();
    expect(html).toContain('aria-label="Daily step target is not set"');
    expect(html).toContain("No daily target");
    expect(html).toContain('href="/settings#daily-step-target"');
    expect(html).toContain("Set target");
  });

  it("keeps target progress unknown until today has a confirmed observation", () => {
    snapshot.profile = { ...profile, dailyStepTarget: 8000 };
    snapshot.dailySteps = [step({ date: "2026-10-04" })];
    const html = renderHome();
    expect(html).toContain('aria-label="No steps logged today; daily target 8,000 steps"');
    expect(html).not.toContain('aria-label="Daily step target progress: 0%"');
    expect(html).toContain("Edit target");
  });

  it.each([
    [0, "0%", "0 of 8,000 steps"],
    [6500, "81%", "6,500 of 8,000 steps"],
    [8000, "100%", "8,000 of 8,000 steps"],
    [12000, "100%", "12,000 of 8,000 steps"],
  ])("shows saved %i steps accurately while clamping only the ring", (steps, percent, count) => {
    snapshot.profile = { ...profile, dailyStepTarget: 8000 };
    snapshot.dailySteps = [step({ steps })];
    const html = renderHome();
    expect(html).toContain(`aria-label="Daily step target progress: ${percent}"`);
    expect(html).toContain(count);
    expect(html).toContain(`<span aria-hidden="true">${steps.toLocaleString()} / 8,000</span>`);
    expect(html).toContain(`<span class="sr-only">${count}</span>`);
    expect(html.includes("Target reached")).toBe(steps >= 8000);
  });

  it("keeps the right-column order and both responsive workout placements", () => {
    const html = renderHome();
    expect(html.indexOf("Your progress")).toBeLessThan(html.indexOf("Today&#x27;s steps"));
    expect(html.indexOf("Today&#x27;s steps")).toBeLessThan(html.indexOf('href="/grocery"'));
    expect(html.indexOf('id="home-workout-heading-desktop"')).toBeLessThan(html.indexOf("Your progress"));
    expect(html.indexOf('id="home-workout-heading-mobile"')).toBeLessThan(html.indexOf('href="/grocery"'));
  });

  it("keeps missing activity unknown and excludes other dates", () => {
    snapshot.dailySteps = [step({ date: "2026-10-04", steps: 1234 })];
    const html = renderHome();
    expect(html).toContain("Not logged");
    expect(html).toContain("No steps logged today");
    expect(html).toContain("Energy not logged");
    expect(html).not.toContain("1,234 steps");
    expect(html).not.toContain("Manual entry");
    expect(html).not.toContain("Edit steps");
    expect(html).toContain('aria-label="Log daily steps"');
    expect(html.match(/href="\/activity"/g)).toHaveLength(1);
  });

  it("distinguishes a saved zero from an unlogged day", () => {
    snapshot.dailySteps = [step({ steps: 0, walkingMinutes: undefined })];
    const html = renderHome();
    expect(html).toContain('<span aria-hidden="true">0</span>');
    expect(html).toContain('<span class="sr-only">0 steps</span>');
    expect(html).not.toContain("Manual entry");
    expect(html).toContain("Walking time not logged");
    expect(html).toContain("Add walking minutes for an estimate");
    expect(html).toContain('aria-label="Edit daily steps"');
    expect(html).not.toContain("Edit steps");
    expect(html).not.toContain("Log steps");
    expect(html.match(/href="\/activity"/g)).toHaveLength(1);
    expect(html).not.toContain("No steps logged today");
  });

  it("shows saved minutes and the existing broad range without changing food targets", () => {
    snapshot.dailySteps = [step()];
    const html = renderHome();
    expect(html).toContain('<span aria-hidden="true">6,500</span>');
    expect(html).toContain('<span class="sr-only">6,500 steps</span>');
    expect(html).toContain("35 walking minutes");
    expect(html).toContain("≈110–160 kcal");
    expect(html).toContain("Estimated walking energy: approximately 110 to 160 kilocalories");
    expect(html).toContain('class="lucide lucide-clock');
    expect(html).not.toContain("Manual entry");
    expect(html).not.toContain("Walking energy: roughly");
    expect(html).toContain('aria-label="About Today&#x27;s steps"');
    expect(html).not.toContain("Estimate details");
    expect(html).not.toContain("Food targets stay unchanged.");
    expect(html).toContain("Monday, October 5");
  });

  it("keeps zero walking minutes explicit without a calorie estimate", () => {
    snapshot.dailySteps = [step({ walkingMinutes: 0 })];
    const html = renderHome();
    expect(html).toContain("0 walking minutes");
    expect(html).toContain("Energy unavailable for 0 minutes");
    expect(html).not.toContain("Estimate details");
    expect(html).not.toContain("Walking energy: roughly");
  });

  it.each([18, 60])("retains saved observations when age %i is outside the reference", (age) => {
    snapshot.profile = { ...profile, age };
    snapshot.dailySteps = [step()];
    const html = renderHome();
    expect(html).toContain('<span aria-hidden="true">6,500</span>');
    expect(html).toContain('<span class="sr-only">6,500 steps</span>');
    expect(html).toContain("35 walking minutes");
    expect(html).toContain("Energy unavailable for this profile");
    expect(html).not.toContain("Walking energy: roughly");
  });

  it("does not estimate for an unsupported screening outcome", () => {
    snapshot.profile = { ...profile, targetEligibility: "unsupported" };
    snapshot.dailySteps = [step()];
    expect(renderHome()).toContain("Energy unavailable for this profile");
  });

  it.each([undefined, 0])("keeps profile eligibility ahead of missing or zero walking minutes (%s)", (walkingMinutes) => {
    snapshot.profile = { ...profile, age: 60 };
    snapshot.dailySteps = [step({ walkingMinutes })];
    const html = renderHome();
    expect(html).toContain("Energy unavailable for this profile");
    expect(html).not.toContain("Add walking minutes for an estimate");
    expect(html).not.toContain("Energy unavailable for 0 minutes");
  });
});

describe("Home workout energy status", () => {
  it.each([
    ["eligible", "Energy estimate: not logged."],
    ["unsupported", "Energy estimate unavailable for this profile."],
  ] as const)("shows the %s status in a white fire-icon pill", (targetEligibility, message) => {
    snapshot.profile = { ...profile, targetEligibility };
    const html = renderHome();
    const pill = html.match(/<p class="mt-\[17px\] inline-flex[^]*?<\/p>/)?.[0];
    expect(pill).toContain("bg-white px-3 py-1");
    expect(pill).toContain("lucide-flame");
    expect(pill).toContain(`<span class="min-w-0">${message}</span>`);
  });

  it("does not render an empty status pill when workout energy is available", () => {
    snapshot.sessions = [{ id: "session", plannedWorkoutId: "workout", date: "2026-10-05", startedAt: "2026-10-05T08:00:00Z", finishedAt: "2026-10-05T08:30:00Z", status: "completed", logs: [] }];
    const html = renderHome();
    expect(html).not.toContain("Energy estimate: not logged.");
    expect(html).not.toContain('mt-[17px] inline-flex max-w-full items-center gap-1.5 rounded-full bg-white');
  });
});

describe("Home meals summary states", () => {
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
    const html = renderHome();
    expect(html).toContain(`aria-label="${summary}"`);
    expect(html).toContain(caption);
    expect(html).toContain(count === 0 ? "No meals logged yet" : `${count} of 4 meals logged`);
    expect(html).toContain('aria-label="Protein"');
    expect(html).toContain(count === 0 ? 'aria-valuetext="No entry logged"' : `aria-valuenow="${calories === 0 ? 0 : count * 10}"`);
  });

  it("keeps logging available when daily targets are missing", () => {
    const html = renderHome();
    expect(html).toContain("Daily targets aren&#x27;t set yet. You can still log meals.");
    expect(html).toContain('aria-label="No calorie target set"');
    expect(html).toContain('aria-label="Add food"');
  });
});

describe("Home compact workout summary", () => {
  it("retains rest-day copy and navigation", () => {
    const html = renderHome();
    expect(html).toContain("Rest day — no workout scheduled.");
    expect(html).toContain("View this week");
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
    expect(html).toContain("Start workout");
    expect(html).toContain("Two manageable sessions in a row");
  });
});
