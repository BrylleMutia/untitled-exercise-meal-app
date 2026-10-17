import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addDays, startOfWeek, todayKey, weekDates } from "@/utility/dates";
import { nutritionWeekSnapshot } from "@/utility/nutritionWeek";
import { generateGroceryList } from "@/utility/grocery";
import { foodMacros } from "@/utility/nutrition";
import { generateWeeklyMeals, weeklyRecipeOptions } from "@/utility/weeklyMealGeneration";
import { recipeIngredientDraft, recipePreview, recipeUnitConversion } from "@/utility/recipeEditor";
import { providedRecipeLogEntry } from "@/utility/providedRecipeNutrition";
import { createSupabaseRepository } from "@/services/supabaseRepository";
import type { Database } from "@/types/database.generated";
import type { AppSnapshot, UserProfile, WorkoutSession } from "@/types/domain";

const localUrl = "http://127.0.0.1:56321";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (url !== localUrl || !key) {
  throw new Error(`Repository integration tests require the local Supabase stack at ${localUrl}.`);
}

type TestAccount = {
  client: SupabaseClient<Database>;
  repository: ReturnType<typeof createSupabaseRepository>;
  id: string;
  email: string;
  password: string;
};

const accounts: TestAccount[] = [];

function makeClient() {
  return createClient<Database>(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function createAccount(): Promise<TestAccount> {
  const client = makeClient();
  const id = randomUUID();
  const email = `repo-${id}@example.test`;
  const password = `Local-${randomUUID()}-Pass!`;
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  let session = data.session;
  let user = data.user;
  if (!session) {
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) {
      throw signedIn.error ?? new Error("Local test account did not receive a session.");
    }
    session = signedIn.data.session;
    user = signedIn.data.user;
  }
  if (!user?.id || !session) throw new Error("Local test account was created without an authenticated identity.");
  const account = { client, repository: createSupabaseRepository(client), id: user.id, email, password };
  accounts.push(account);
  return account;
}

function profile(id: string, name: string): UserProfile {
  return {
    id,
    name,
    age: 30,
    sex: "female",
    heightCm: 168,
    weightKg: 68,
    units: "metric", weekStartsOn: 1,
    experience: "beginner",
    equipment: ["none"],
    daysPerWeek: 3,
    sessionMinutes: 45,
    goal: "maintain",
    dietaryPattern: "No restrictions",
    allergies: [],
    notificationsEnabled: false,
    targetEligibility: "eligible",
    eligibilityVersion: "calicoach-eligibility-v1",
    createdAt: new Date().toISOString(),
  };
}

function eggEntry(date: string) {
  return {
    date,
    slot: "breakfast" as const,
    foodId: "food-egg",
    servings: 1,
    servingQuantity: 1,
    servingUnit: "piece" as const,
    calories: 72,
    proteinG: 6.3,
    carbsG: 0.4,
    fatG: 4.8,
    estimated: true,
    confidence: "high" as const,
    source: "Starter Food Catalog",
    sourceVersion: "2026.09",
    preparationBasis: "as_labeled" as const,
    valueSource: "development_catalog" as const,
  };
}

function completedSession(snapshot: AppSnapshot, session: WorkoutSession): WorkoutSession {
  const workout = snapshot.plan?.workouts.find((item) => item.id === session.plannedWorkoutId);
  if (!workout) throw new Error("Started workout was not present in the refreshed plan.");
  return {
    ...session,
    logs: workout.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      plannedExerciseId: exercise.id,
      planned: {
        sets: exercise.sets,
        ...(exercise.reps === undefined ? {} : { reps: exercise.reps }),
        ...(exercise.holdSeconds === undefined ? {} : { holdSeconds: exercise.holdSeconds }),
      },
      actual: {
        sets: exercise.sets,
        ...(exercise.reps === undefined ? {} : { reps: exercise.reps }),
        ...(exercise.holdSeconds === undefined ? {} : { holdSeconds: exercise.holdSeconds }),
      },
      status: "completed" as const,
      rpe: 5,
    })),
  };
}

describe("Supabase repository against the disposable local stack", () => {
  it("saves exact weekly spending, preserves it across refresh, exports it, and rejects competing writers", async () => {
    const account = await createAccount();
    const base = (await account.repository.completeOnboarding({ profile: profile(account.id, "Weekly spending"), currentSnapshot: (await account.repository.load())!, idempotencyKey: randomUUID() })).snapshot;
    const weekOf = addDays(startOfWeek(todayKey(), 1), 35);
    const initial = await account.repository.loadNutritionWeek(weekOf);
    const input = { weekOf, calendarRevision: base.profile!.calendarRevision!, totalAmountCentavos: 125050, expectedVersions: { groceryRevision: 0 }, currentSnapshot: nutritionWeekSnapshot(base, initial), idempotencyKey: randomUUID() };
    await account.repository.setGroceryTotalAmount(input);
    await account.repository.setGroceryTotalAmount(input);
    let week = await account.repository.loadNutritionWeek(weekOf);
    expect(week.grocery).toMatchObject({ totalAmountCentavos: 125050, items: [] });
    await expect(account.repository.setGroceryTotalAmount({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    await account.repository.addCustomGrocery({ name: "Spending extra", quantity: 1, unit: "pcs", currentSnapshot: nutritionWeekSnapshot(base, week), idempotencyKey: randomUUID() });
    week = await account.repository.loadNutritionWeek(weekOf);
    const context = nutritionWeekSnapshot(base, week);
    const competing = await Promise.allSettled([
      account.repository.setGroceryTotalAmount({ ...input, totalAmountCentavos: 50000, currentSnapshot: context, expectedVersions: { groceryRevision: week.grocery!.revision! }, idempotencyKey: randomUUID() }),
      account.repository.updateGrocery({ type: "quantity", itemId: week.grocery!.items[0].id, quantity: 3, idempotencyKey: randomUUID() }, context),
    ]);
    expect(competing.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(competing.find(result => result.status === "rejected")).toMatchObject({ reason: { repositoryError: { code: "stale_version" } } });
    week = await account.repository.loadNutritionWeek(weekOf);
    const recorded = week.grocery!.totalAmountCentavos;
    await account.repository.regenerateGrocery({ currentSnapshot: nutritionWeekSnapshot(base, week), idempotencyKey: randomUUID() });
    expect((await account.repository.loadNutritionWeek(weekOf)).grocery!.totalAmountCentavos).toBe(recorded);
    const exported = await account.repository.exportData();
    expect(exported.data!.groceryLists.find(row => row.week_of === weekOf)?.total_amount_centavos).toBe(recorded);
    const fresh = await account.repository.loadNutritionWeek(weekOf);
    const changed = await Promise.allSettled([
      account.repository.setWeekStart({ weekStartsOn: 6, expectedRevision: base.profile!.revision!, idempotencyKey: randomUUID() }),
      account.repository.setGroceryTotalAmount({ ...input, totalAmountCentavos: 60000, currentSnapshot: nutritionWeekSnapshot(base, fresh), expectedVersions: { groceryRevision: fresh.grocery!.revision! }, idempotencyKey: randomUUID() }),
    ]);
    expect(changed.some(result => result.status === "fulfilled")).toBe(true);
    const after = (await account.repository.load())!;
    const regrouped = await account.repository.loadNutritionWeek(startOfWeek(weekOf, after.profile!.weekStartsOn));
    expect([recorded, 60000]).toContain(regrouped.grocery!.totalAmountCentavos);
    expect(after.nutritionLogs).toEqual(base.nutritionLogs);
  });
  it("serializes competing calendar changes without merging their effects", async () => {
    const account = await createAccount();
    const empty = (await account.repository.load())!;
    const before = (await account.repository.completeOnboarding({ profile: { ...profile(account.id, "Calendar race"), weekStartsOn: 0 }, currentSnapshot: empty, idempotencyKey: randomUUID() })).snapshot;
    const outcomes = await Promise.allSettled(([1, 6] as const).map(weekStartsOn => account.repository.setWeekStart({ weekStartsOn, expectedRevision: before.profile!.revision!, idempotencyKey: randomUUID() })));
    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(outcome => outcome.status === "rejected")).toHaveLength(1);
    const after = (await account.repository.load())!;
    expect(after.profile?.calendarRevision).toBe(before.profile!.calendarRevision! + 1);
    expect(after.target).toEqual(before.target);
    expect(after.plan).toEqual(before.plan);
  });
  it("regroups calendar preferences atomically while retaining prescribed dates and rejecting stale clients", async () => {
    const account = await createAccount();
    const empty = (await account.repository.load())!;
    const before = (await account.repository.completeOnboarding({ profile: { ...profile(account.id, "Calendar"), weekStartsOn: 0 }, currentSnapshot: empty, idempotencyKey: randomUUID() })).snapshot;
    const originalMeals = before.mealPlan!.meals;
    const originalTarget = before.target;
    const originalWorkouts = before.plan;
    const input = { weekStartsOn: 6 as const, expectedRevision: before.profile!.revision!, idempotencyKey: randomUUID() };
    const changed = await account.repository.setWeekStart(input);
    expect(changed.snapshot.profile?.weekStartsOn).toBe(6);
    expect(changed.snapshot.profile?.calendarRevision).toBe(before.profile!.calendarRevision! + 1);
    expect(changed.snapshot.target).toEqual(originalTarget);
    expect(changed.snapshot.plan).toEqual(originalWorkouts);
    const recovered = (await Promise.all([...new Set(originalMeals.map(row => startOfWeek(row.date, 6)))].map(week => account.repository.loadNutritionWeek(week)))).flatMap(week => week.mealPlan?.meals ?? []);
    expect(recovered.sort((a, b) => a.id.localeCompare(b.id))).toEqual([...originalMeals].sort((a, b) => a.id.localeCompare(b.id)));
    expect((await account.repository.setWeekStart(input)).snapshot.profile?.weekStartsOn).toBe(6);
    await expect(account.repository.setWeekStart({ weekStartsOn: 1, expectedRevision: before.profile!.revision!, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
  });
  it("audits complete generated groceries and isolates edits, retries and extras by selected week", async () => {
    const account = await createAccount();
    const empty = (await account.repository.load())!;
    const base = (await account.repository.completeOnboarding({ profile: profile(account.id, "Grocery Weeks"), currentSnapshot: empty, idempotencyKey: randomUUID() })).snapshot;
    const weeks = [addDays(startOfWeek(todayKey(), 1), 7), addDays(startOfWeek(todayKey(), 1), 14)];
    for (const weekOf of weeks) {
      const week = await account.repository.loadNutritionWeek(weekOf);
      const context = nutritionWeekSnapshot(base, week);
      const selected = base.savedMeals.filter(recipe => recipe.isSystem && !recipe.archivedAt && !recipe.id.startsWith("meal-default-"));
      const preview = generateWeeklyMeals(context, weekOf, selected.map(recipe => recipe.id), "grocery-audit");
      expect(preview.assignments).toHaveLength(14);
      await account.repository.generateNutritionWeek({ weekOf, selectedDates: weekDates(weekOf), recipes: selected.map(recipe => ({ id: recipe.id, revision: recipe.revision! })), assignments: preview.assignments,
        currentSnapshot: context, expectedVersions: { profileRevision: base.profile!.revision, mealPlanVersion: 0, groceryRevision: 0 }, idempotencyKey: randomUUID() });
      const saved = await account.repository.loadNutritionWeek(weekOf);
      const scoped = nutritionWeekSnapshot(base, saved);
      const expected = generateGroceryList(saved.mealPlan!, scoped.savedMeals, scoped.foods, weekOf);
      expect(saved.grocery!.items.map(item => [item.id, item.generatedQuantity, item.unit]).sort()).toEqual(expected.items.map(item => [item.id, item.generatedQuantity, item.unit]).sort());
      expect(saved.grocery!.items.find(item => item.id === "gi-food-chicken-prep-171077")?.generatedQuantity).toBe(1200);
      expect(saved.grocery!.items.find(item => item.id === "gi-food-korean-beef-168877")?.generatedQuantity).toBe(500);
    }
    const otherWeek = await account.repository.loadNutritionWeek(weeks[1]);
    let first = await account.repository.loadNutritionWeek(weeks[0]);
    const itemId = "gi-food-chicken-prep-171077", key = randomUUID();
    const oldContext = nutritionWeekSnapshot(base, first);
    const input = { type: "quantity" as const, itemId, quantity: 1300, idempotencyKey: key };
    await account.repository.updateGrocery(input, oldContext);
    await account.repository.updateGrocery(input, oldContext);
    await expect(account.repository.updateGrocery({ ...input, idempotencyKey: randomUUID() }, oldContext)).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    first = await account.repository.loadNutritionWeek(weeks[0]);
    await account.repository.updateGrocery({ type: "toggle", itemId, idempotencyKey: randomUUID() }, nutritionWeekSnapshot(base, first));
    first = await account.repository.loadNutritionWeek(weeks[0]);
    await account.repository.regenerateGrocery({ currentSnapshot: nutritionWeekSnapshot(base, first), idempotencyKey: randomUUID() });
    first = await account.repository.loadNutritionWeek(weeks[0]);
    expect(first.grocery!.items.find(item => item.id === itemId)).toMatchObject({ generatedQuantity: 1200, quantity: 1300, checked: true });
    expect((await account.repository.loadNutritionWeek(weeks[1])).grocery).toEqual(otherWeek.grocery);
    const emptyWeek = await account.repository.loadNutritionWeek(addDays(weeks[1], 7));
    await account.repository.addCustomGrocery({ name: "Empty-week extra", quantity: 2, unit: "pcs", currentSnapshot: { ...nutritionWeekSnapshot(base, emptyWeek), grocery: { id: `gl-${emptyWeek.weekOf}`, weekOf: emptyWeek.weekOf, items: [] } }, idempotencyKey: randomUUID() });
    expect((await account.repository.loadNutritionWeek(emptyWeek.weekOf)).grocery?.items[0]).toMatchObject({ name: "Empty-week extra", quantity: 2, custom: true });
    expect((await account.repository.loadNutritionWeek(weeks[1])).grocery).toEqual(otherWeek.grocery);
    expect((await account.repository.load())!.mealPlan).toEqual(base.mealPlan);
  });
  let userA: TestAccount;
  let userB: TestAccount;
  let initialA: AppSnapshot;

  it("generates the reviewed week atomically, preserves grocery edits and history, and rejects stale competing previews", async () => {
    const account = await createAccount();
    const empty = (await account.repository.load())!;
    let base = (await account.repository.completeOnboarding({ profile: profile(account.id, "Weekly generator"), currentSnapshot: empty, idempotencyKey: randomUUID() })).snapshot;
    const source = base.savedMeals.find(meal => meal.id === "meal-korean-beef-bowl")!;
    const id = `generation-${randomUUID()}`;
    base = (await account.repository.saveRecipe({ meal: { ...source, id, isSystem: false, revision: undefined, name: "Weekly assigned bowl", mealSlots: ["breakfast", "snack"] }, newFoods: [], currentSnapshot: base, idempotencyKey: randomUUID() })).snapshot;
    const saved = base.savedMeals.find(meal => meal.id === id)!;
    expect(saved.mealSlots).toEqual(["breakfast", "snack"]);
    const weekOf = startOfWeek(addDays(todayKey(), 21), 1);
    let week = await account.repository.loadNutritionWeek(weekOf);
    let current = nutritionWeekSnapshot(base, week);
    const manual = { id: `manual-${randomUUID()}`, date: weekOf, slot: "breakfast" as const, mealId: id, label: saved.name, servings: 1 };
    await account.repository.addPlannedMeal({ plannedMeal: manual, currentSnapshot: current, idempotencyKey: randomUUID() });
    week = await account.repository.loadNutritionWeek(weekOf);
    current = nutritionWeekSnapshot(base, week);
    await account.repository.addCustomGrocery({ name: "Keep my grocery", quantity: 2, unit: "item", currentSnapshot: current, idempotencyKey: randomUUID() });
    week = await account.repository.loadNutritionWeek(weekOf);
    await account.repository.setGroceryTotalAmount({ weekOf, calendarRevision: base.profile!.calendarRevision!, totalAmountCentavos: 125050, expectedVersions: { groceryRevision: week.grocery!.revision! }, currentSnapshot: nutritionWeekSnapshot(base, week), idempotencyKey: randomUUID() });
    week = await account.repository.loadNutritionWeek(weekOf);
    current = nutritionWeekSnapshot(base, week);
    const preview = generateWeeklyMeals(current, weekOf, [id], "repository-preview");
    expect(preview.assignments).toHaveLength(3);
    expect(preview.unused).toEqual([]);
    const input = { weekOf, selectedDates: weekDates(weekOf), recipes: [{ id, revision: saved.revision! }], assignments: preview.assignments, currentSnapshot: current,
      expectedVersions: { profileRevision: base.profile!.revision, mealPlanVersion: week.mealPlan!.version, groceryRevision: week.grocery!.revision }, idempotencyKey: randomUUID() };
    const outcomes = await Promise.all([account.repository.generateNutritionWeek(input), account.repository.generateNutritionWeek(input)]);
    expect(outcomes[0].snapshot.mealPlan).toEqual(base.mealPlan);
    expect(outcomes[0].snapshot.nutritionLogs).toEqual(base.nutritionLogs);
    expect(outcomes[0].snapshot.sessions).toEqual(base.sessions);
    const after = await account.repository.loadNutritionWeek(weekOf);
    expect(after.mealPlan!.meals).toHaveLength(4);
    expect(after.grocery!.totalAmountCentavos).toBe(125050);
    expect(after.mealPlan!.version).toBe(week.mealPlan!.version + 1);
    expect(after.mealPlan!.meals.find(row => row.id === manual.id)).toEqual(week.mealPlan!.meals.find(row => row.id === manual.id));
    expect(after.mealPlan!.meals.every(row => row.expectedCalories === 560 && row.expectedProteinG === 45)).toBe(true);
    expect(after.grocery!.items.find(item => item.name === "Keep my grocery")).toEqual(week.grocery!.items.find(item => item.name === "Keep my grocery"));
    expect(weeklyRecipeOptions(nutritionWeekSnapshot(base, after), weekOf).find(option => option.recipe.id === id)?.capacity).toBe(0);
    await expect(account.repository.generateNutritionWeek({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    expect((await account.repository.load())!.mealPlan).toEqual(base.mealPlan);
    const edited = await account.repository.saveRecipe({ meal: { ...saved, servings: 40 }, newFoods: [], currentSnapshot: base,
      expectedVersions: { recordRevision: saved.revision, groceryRevision: base.grocery!.revision }, idempotencyKey: randomUUID() });
    expect(edited.snapshot.savedMeals.find(meal => meal.id === id)?.servings).toBe(40);
    expect((await account.repository.loadNutritionWeek(weekOf)).mealPlan).toEqual(after.mealPlan);
    expect((await account.repository.loadNutritionWeek(weekOf)).grocery).toEqual(after.grocery);
    expect((await account.repository.loadNutritionWeek(weekOf)).grocery!.totalAmountCentavos).toBe(125050);
    const exported = await account.repository.exportData({ idempotencyKey: randomUUID() });
    expect(JSON.stringify(exported.data)).toContain('"meal_slots":["breakfast","snack"]');
  });

  it("round-trips original cooking measurements, ranges and seasonings without rewriting plans or history", async () => {
    const account = await createAccount();
    const empty = (await account.repository.load())!;
    const base = (await account.repository.completeOnboarding({ profile: profile(account.id, "Cooking Units"), currentSnapshot: empty, idempotencyKey: randomUUID() })).snapshot;
    const recipe = { id: `cooking-${randomUUID()}`, name: "Cooking units", mealSlots: ["breakfast" as const], servings: 2, complexity: "easy" as const, notes: "Prepare and serve.",
      nutritionNotes: "Upper range amount used.", unmeasuredIngredients: [{ name: "Salt", measurement: "To taste" }],
      ingredients: [{ foodId: "food-egg", servings: 2, cookingMeasurement: { kind: "range" as const, name: "Eggs", quantity: 1, upperQuantity: 2, unit: "piece" } }] };
    const input = { meal: recipe, newFoods: [], currentSnapshot: base, idempotencyKey: randomUUID() };
    const saved = await account.repository.saveRecipe(input);
    const loaded = saved.snapshot.savedMeals.find(meal => meal.id === recipe.id)!;
    expect(loaded.ingredients[0].cookingMeasurement).toEqual(recipe.ingredients[0].cookingMeasurement);
    expect(loaded.unmeasuredIngredients).toEqual(recipe.unmeasuredIngredients);
    expect(loaded.nutritionNotes).toBe(recipe.nutritionNotes);
    expect(saved.snapshot.nutritionLogs).toEqual(base.nutritionLogs);
    expect(saved.snapshot.mealPlan).toEqual(base.mealPlan);
    const replay = await account.repository.saveRecipe(input);
    expect(replay.snapshot.savedMeals.find(meal => meal.id === recipe.id)).toEqual(loaded);
    const source = recipeIngredientDraft(loaded.ingredients[0], saved.snapshot.foods.find(food => food.id === "food-egg")!, "egg-conversion");
    const conversion = recipeUnitConversion(source, source.food!, "cup", { unit: "cup", gramsPerUnit: 200 });
    if (conversion.status !== "converted") throw new Error("Expected a confirmed cooking conversion");
    const convertedIngredients = recipePreview([{ ...source, ...conversion.patch }], String(loaded.servings), saved.snapshot.foods)!.ingredients;
    const converted = await account.repository.saveRecipe({ meal: { ...loaded, ingredients: convertedIngredients }, newFoods: [], currentSnapshot: saved.snapshot, expectedVersions: { recordRevision: loaded.revision, groceryRevision: saved.snapshot.grocery?.revision }, idempotencyKey: randomUUID() });
    const convertedRecipe = converted.snapshot.savedMeals.find(meal => meal.id === recipe.id)!;
    expect(convertedRecipe.ingredients[0]).toMatchObject({ servings: 2, cookingMeasurement: { quantity: 0.25, upperQuantity: 0.5, unit: "cup", gramsPerUnit: 200 } });
    expect(converted.snapshot.mealPlan).toEqual(saved.snapshot.mealPlan); expect(converted.snapshot.nutritionLogs).toEqual(saved.snapshot.nutritionLogs); expect(converted.snapshot.grocery).toEqual(saved.snapshot.grocery);
    const week = await account.repository.loadNutritionWeek(startOfWeek(todayKey(), 1));
    expect(week.recipes.find(meal => meal.id === "meal-creamy-lemon-chicken")?.ingredients[3].cookingMeasurement).toMatchObject({ quantity: 300, unit: "ml", gramsPerUnit: 1.03 });
    const exported = await account.repository.exportData({ idempotencyKey: randomUUID() });
    if (!exported.data) throw new Error("Account export returned no data");
    expect(JSON.stringify(exported.data.savedMealIngredients)).toContain('"upperQuantity":0.5');
    expect(JSON.stringify(exported.data.savedMeals)).toContain('"unmeasured_ingredients"');
    const edit = { ...convertedRecipe, providedNutrition: { calories: 560, proteinG: 45, carbsG: 58, fatG: 16 }, ingredients: [{ foodId: "food-egg", servings: 3, cookingMeasurement: { kind: "range" as const, quantity: 1, upperQuantity: 3, unit: "piece" } }] };
    const changed = await account.repository.saveRecipe({ meal: edit, newFoods: [], currentSnapshot: converted.snapshot, expectedVersions: { recordRevision: convertedRecipe.revision, groceryRevision: converted.snapshot.grocery?.revision }, idempotencyKey: randomUUID() });
    expect(changed.snapshot.savedMeals.find(meal => meal.id === recipe.id)).toMatchObject({ providedNutrition: edit.providedNutrition, ingredients: [{ servings: 3 }] });
    await expect(account.repository.saveRecipe({ ...input, meal: { ...recipe, ingredients: [{ foodId: "food-egg", servings: 2, cookingMeasurement: { kind: "amount", quantity: 1, unit: "cup" } }] }, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
  });

  it("corrects whole saved-recipe portions atomically and preserves plans, supplied macros and retries", async () => {
    const account = await createAccount();
    const empty = (await account.repository.load())!;
    const current = (await account.repository.completeOnboarding({ profile: profile(account.id, "Recipe Portions"), currentSnapshot: empty, idempotencyKey: randomUUID() })).snapshot;
    const date = todayKey();
    const chicken = current.savedMeals.find(meal => meal.id === "meal-creamy-lemon-chicken")!;
    const ingredients = chicken.ingredients.map(ingredient => {
      const food = current.foods.find(food => food.id === ingredient.foodId)!;
      const servings = ingredient.servings * 3 / chicken.servings;
      return { ...eggEntry(date), slot: "snack" as const, foodId: food.id, servings, ...foodMacros(food, servings), source: food.source, valueSource: food.valueSource };
    });
    const logged = await account.repository.saveSavedMealLog({ date, slot: "snack", entries: ingredients, meal: chicken, recipeServings: 3, idempotencyKey: randomUUID() });
    const group = logged.snapshot.loggedMeals.find(meal => meal.mealId === chicken.id)!;
    expect(group.recipeServings).toBe(3);
    const oldEntries = logged.snapshot.nutritionLogs.filter(entry => entry.loggedMealId === group.id);
    const input = { loggedMeal: group, ingredients: [], recipeServings: 0.5, currentSnapshot: logged.snapshot, idempotencyKey: randomUUID() };
    const corrected = await account.repository.updateLoggedMeal(input);
    const replayed = await account.repository.updateLoggedMeal(input);
    expect(corrected.snapshot.loggedMeals.find(meal => meal.id === group.id)).toMatchObject({ recipeServings: 0.5, revision: group.revision + 1 });
    for (const entry of replayed.snapshot.nutritionLogs.filter(entry => entry.loggedMealId === group.id)) {
      const before = oldEntries.find(old => old.id === entry.id)!;
      expect(entry.calories).toBeCloseTo(before.calories / 6, 1);
      expect(Math.abs(entry.servings - before.servings / 6)).toBeLessThanOrEqual(0.00051); // Stored food quantities have three decimal places.
      expect(entry.source).toBe(before.source);
    }
    expect(replayed.snapshot.mealPlan).toEqual(current.mealPlan);
    expect(replayed.snapshot.grocery).toEqual(current.grocery);
    expect(replayed.snapshot.savedMeals).toEqual(current.savedMeals);
    expect((await account.repository.loadNutritionWeek(startOfWeek(date, 1))).loggedMeals.find(meal => meal.id === group.id)?.recipeServings).toBe(0.5);
    await expect(account.repository.updateLoggedMeal({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    await expect(userB.repository.updateLoggedMeal({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "not_found" } });
    const beef = current.savedMeals.find(meal => meal.id === "meal-korean-beef-bowl")!;
    const provided = await account.repository.saveSavedMealLog({ date, slot: "dinner", entries: [providedRecipeLogEntry(beef, 3, date, "dinner")!], meal: beef, recipeServings: 3, idempotencyKey: randomUUID() });
    const beefGroup = provided.snapshot.loggedMeals.find(meal => meal.mealId === beef.id)!;
    const half = await account.repository.updateLoggedMeal({ loggedMeal: beefGroup, ingredients: [], recipeServings: 0.5, currentSnapshot: provided.snapshot, idempotencyKey: randomUUID() });
    expect(half.snapshot.nutritionLogs.find(entry => entry.loggedMealId === beefGroup.id)).toMatchObject({ calories: 280, proteinG: 22.5, carbsG: 29, fatG: 8 });
  });

  it("reads and edits independent weeks without switching the global current plan", async () => {
    const account = await createAccount();
    const empty = (await account.repository.load())!;
    const base = (await account.repository.completeOnboarding({ profile: profile(account.id, "Week Integration"), currentSnapshot: empty, idempotencyKey: randomUUID() })).snapshot;
    const currentWeek = base.mealPlan!.weekOf;
    const weeks = [startOfWeek(addDays(todayKey(), 7), 1), startOfWeek(addDays(todayKey(), 14), 1)];
    for (const weekOf of weeks) {
      const context = await account.repository.loadNutritionWeek(weekOf);
      const result = await account.repository.addPlannedMeal({ plannedMeal: { id: `beef-${weekOf}`, date: weekOf, slot: "lunch", mealId: "meal-korean-beef-bowl", label: "Korean Beef Bowl", servings: 0.5 }, currentSnapshot: nutritionWeekSnapshot(base, context), idempotencyKey: randomUUID() });
      expect(result.snapshot.mealPlan?.weekOf).toBe(currentWeek);
      expect((await account.repository.loadNutritionWeek(weekOf)).mealPlan?.meals[0]).toMatchObject({ expectedCalories: 280, expectedProteinG: 22.5, expectedCarbsG: 29, expectedFatG: 8 });
    }
    const older = await account.repository.loadNutritionWeek(weeks[0]);
    const newer = await account.repository.loadNutritionWeek(weeks[1]);
    const input = { id: older.mealPlan!.meals[0].id, currentSnapshot: nutritionWeekSnapshot(base, older), idempotencyKey: randomUUID() };
    await account.repository.skipPlannedMeal(input);
    const skipped = await account.repository.loadNutritionWeek(weeks[0]);
    expect(skipped.mealPlan?.version).toBe(2);
    expect(skipped.mealPlan?.meals[0]).toMatchObject({ skipped: true, expectedCalories: 280 });
    expect((await account.repository.loadNutritionWeek(weeks[1])).mealPlan).toEqual(newer.mealPlan);
    await expect(account.repository.skipPlannedMeal({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    await account.repository.skipPlannedMeal({ ...input, currentSnapshot: nutritionWeekSnapshot(base, skipped), idempotencyKey: randomUUID() });
    const restored = await account.repository.loadNutritionWeek(weeks[0]);
    expect(restored.mealPlan?.meals[0]).toMatchObject({ expectedProteinG: 22.5 });
    expect(restored.mealPlan?.meals[0].skipped).not.toBe(true);
    const otherAccountWeek = await userB.repository.loadNutritionWeek(startOfWeek(weeks[0], 0));
    expect(otherAccountWeek.mealPlan).toBeNull();
    expect((await account.repository.load())?.mealPlan?.weekOf).toBe(currentWeek);
    const competing = [1, 1.5].map(servings => ({
      mealPlan: { ...restored.mealPlan!, meals: restored.mealPlan!.meals.map(meal => ({ ...meal, servings })) },
      currentSnapshot: nutritionWeekSnapshot(base, restored), idempotencyKey: randomUUID(),
    }));
    const results = await Promise.allSettled(competing.map(input => account.repository.editMealPlan(input)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ repositoryError: { code: "stale_version" } });
    const winner = results.findIndex(result => result.status === "fulfilled");
    await account.repository.editMealPlan(competing[winner]);
    expect((await account.repository.loadNutritionWeek(weeks[0])).mealPlan?.version).toBe(restored.mealPlan!.version + 1);
    expect((await account.repository.loadNutritionWeek(weeks[1])).mealPlan).toEqual(newer.mealPlan);
  });

  it("exposes approved shared recipes and zero-calorie water to independent accounts", async () => {
    for (const account of [userA, userB]) {
      const snapshot = (await account.repository.load())!;
      for (const [slug, count] of [["hainanese-chicken-rice", 11], ["korean-broccoli-side-dish", 6], ["tortang-talong-with-chicken", 5]] as const) {
        const recipe = snapshot.savedMeals.find(meal => meal.id === `meal-default-${slug}`)!;
        expect(recipe).toMatchObject({ isSystem: true, servings: 4, image: { kind: "asset", id: slug } });
        expect(recipe.ingredients).toHaveLength(count);
        for (const ingredient of recipe.ingredients) expect(snapshot.foods.some(food => food.id === ingredient.foodId)).toBe(true);
      }
      expect(snapshot.foods.find(food => food.id === "food-default-water-zero")).toMatchObject({ calories: 0, carbsG: 0, proteinG: 0, fatG: 0, valueSource: "user_provided" });
    }
  });
  it("round trips all recipe presets and preserves nutrition, groceries and history during image-only edits", async () => {
    const account = await createAccount();
    const empty = (await account.repository.load())!;
    let current = (await account.repository.completeOnboarding({ profile: profile(account.id, "Image Presets"), currentSnapshot: empty, idempotencyKey: randomUUID() })).snapshot;
    const source = current.savedMeals.find(meal => meal.id === "meal-korean-beef-bowl")!;
    const id = `preset-${randomUUID()}`;
    for (const image of [{ kind: "asset", id: "breakfast-egg-salad" }, { kind: "asset", id: "snack-sandwich" }, { kind: "asset", id: "dinner-curry-omelette" }, null] as const) {
      const recipe = current.savedMeals.find(meal => meal.id === id);
      const input = { meal: { ...(recipe ?? source), id, isSystem: false, revision: recipe?.revision, name: "Preset recipe", image }, newFoods: [], currentSnapshot: current, expectedVersions: { recordRevision: recipe?.revision }, idempotencyKey: randomUUID() };
      const result = await account.repository.saveRecipe(input);
      const saved = result.snapshot.savedMeals.find(meal => meal.id === id)!;
      expect(saved.image ?? null).toEqual(image);
      expect(saved.providedNutrition).toEqual(source.providedNutrition);
      expect(saved.ingredients).toEqual(source.ingredients);
      expect(result.snapshot.mealPlan).toEqual(current.mealPlan);
      if (recipe) expect(result.snapshot.grocery).toEqual(current.grocery);
      else expect(result.snapshot.grocery?.items).toEqual(current.grocery?.items);
      expect(result.snapshot.nutritionLogs).toEqual(current.nutritionLogs);
      expect(result.snapshot.loggedMeals).toEqual(current.loggedMeals);
      expect((await account.repository.saveRecipe(input)).snapshot.savedMeals.find(meal => meal.id === id)?.revision).toBe(saved.revision);
      expect((await account.repository.load())!.savedMeals.find(meal => meal.id === id)?.image ?? null).toEqual(image);
      current = result.snapshot;
    }
    const exported = await account.repository.exportData({ idempotencyKey: randomUUID() });
    expect(JSON.stringify(exported.data)).toContain(id);
  });

  it("loads the replacement catalog and saves a personal copy with its bundled cover", async () => {
    const snapshot = (await userA.repository.load())!;
    const catalog = snapshot.savedMeals.filter(meal => meal.isSystem && !meal.archivedAt);
    expect(catalog.map(meal => meal.id)).toEqual(["meal-creamy-lemon-chicken", "meal-korean-beef-bowl", "meal-sticky-teriyaki-chicken", "meal-chicken-burrito-protein-boxes", "meal-default-hainanese-chicken-rice", "meal-default-korean-broccoli-side-dish", "meal-default-tortang-talong-with-chicken"]);
    const source = catalog[0];
    expect(source).toMatchObject({ complexity: "easy", totalTimeMinutes: 30, servings: 2, image: { kind: "asset", id: "creamy-lemon-chicken" } });
    const id = `recipe-copy-${randomUUID()}`;
    const input = { meal: { ...source, id, isSystem: false, revision: undefined, name: "Creamy Lemon Chicken test copy" },
      newFoods: [], currentSnapshot: snapshot, idempotencyKey: randomUUID() };
    const result = await userA.repository.saveRecipe(input);
    expect(result.snapshot.savedMeals.find(meal => meal.id === id)?.image).toEqual(source.image);
    expect((await userA.repository.loadRecipeCardMetadata(todayKey())).recipes.find(meal => meal.mealId === id)).toMatchObject({ favorite: false, usageCount: 0 });
    const replay = await userA.repository.saveRecipe(input);
    expect(replay.snapshot.savedMeals.filter(meal => meal.id === id)).toHaveLength(1);
    expect(replay.snapshot.nutritionLogs).toEqual(snapshot.nutritionLogs);
  });

  it("persists personal favorites with concurrency protection without changing recipes or plans", async () => {
    const before = (await userA.repository.load())!;
    const meal = before.savedMeals.find(meal => meal.isSystem && !meal.archivedAt)!;
    const metadata = await userA.repository.loadRecipeCardMetadata(todayKey());
    const previous = metadata.recipes.find(item => item.mealId === meal.id)!;
    const input = { mealId: meal.id, favorite: !previous.favorite, expectedRevision: previous.favoriteRevision, asOfDate: todayKey(), idempotencyKey: randomUUID() };
    const outcomes = await Promise.all([userA.repository.setRecipeFavorite(input), userA.repository.setRecipeFavorite(input)]);
    const favorite = outcomes[0].recipes.find(item => item.mealId === meal.id)!;
    expect(favorite.favorite).toBe(input.favorite);
    expect(outcomes[1].recipes.find(item => item.mealId === meal.id)?.favoriteRevision).toBe(favorite.favoriteRevision);
    const competing = await Promise.allSettled([
      userA.repository.setRecipeFavorite({ ...input, favorite: !input.favorite, expectedRevision: favorite.favoriteRevision, idempotencyKey: randomUUID() }),
      userA.repository.setRecipeFavorite({ ...input, favorite: !input.favorite, expectedRevision: favorite.favoriteRevision, idempotencyKey: randomUUID() }),
    ]);
    expect(competing.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(competing.filter(item => item.status === "rejected")).toHaveLength(1);
    const after = (await userA.repository.load())!;
    expect(after.savedMeals).toEqual(before.savedMeals); expect(after.mealPlan).toEqual(before.mealPlan);
    expect(after.grocery).toEqual(before.grocery); expect(after.nutritionLogs).toEqual(before.nutritionLogs);
    const other = await userB.repository.loadRecipeCardMetadata(todayKey());
    expect(other.recipes.find(item => item.mealId === meal.id)?.favorite).toBe(false);
  });

  it("saves authored recipe details and new foods atomically with retry and history preservation", async () => {
    const current = (await userA.repository.load())!;
    const food = { ...current.foods[0], id: `recipe-food-${randomUUID()}`, name: "Recipe custom food", valueSource: "user_provided" as const, source: "User entered", sourceVersion: "1", fdcId: undefined, recordType: undefined, calories: 100, proteinG: 10, carbsG: 10, fatG: 2 };
    const meal = { id: `recipe-${randomUUID()}`, name: "Authored recipe", mealSlots: ["lunch" as const], complexity: "medium" as const, notes: "Stir and serve.", reference: "Cookbook, p. 12", totalTimeMinutes: 45, servings: 2, ingredients: [{ foodId: food.id, servings: 1 }] };
    const input = { meal, newFoods: [food], currentSnapshot: current, expectedVersions: { groceryRevision: current.grocery?.revision }, idempotencyKey: randomUUID() };
    const saved = await userA.repository.saveRecipe(input);
    const replayed = await userA.repository.saveRecipe(input);
    expect(saved.snapshot.savedMeals.find(item => item.id === meal.id)).toMatchObject({ notes: meal.notes, reference: meal.reference, totalTimeMinutes: 45 });
    expect(replayed.snapshot.savedMeals.filter(item => item.id === meal.id)).toHaveLength(1);
    expect(saved.snapshot.nutritionLogs).toEqual(current.nutritionLogs);
    expect(saved.snapshot.loggedMeals).toEqual(current.loggedMeals);
    const original = saved.snapshot.savedMeals.find(item => item.id === meal.id)!;
    const edited = await userA.repository.saveRecipe({ meal: { ...original, reference: "https://example.com/recipe", totalTimeMinutes: 0 }, newFoods: [], currentSnapshot: saved.snapshot, expectedVersions: { recordRevision: original.revision, groceryRevision: saved.snapshot.grocery?.revision }, idempotencyKey: randomUUID() });
    expect(edited.snapshot.savedMeals.find(item => item.id === meal.id)?.reference).toBe("https://example.com/recipe");
    expect(edited.snapshot.savedMeals.find(item => item.id === meal.id)?.totalTimeMinutes).toBe(0);
    await expect(userA.repository.saveRecipe({ ...input, newFoods: [], meal: { ...meal, notes: "" }, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
    await expect(userB.repository.saveRecipe({ ...input, newFoods: [], meal: original, currentSnapshot: (await userB.repository.load())!, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "not_found" } });
    const exported = await userA.repository.exportData({ idempotencyKey: randomUUID() });
    expect(JSON.stringify(exported.data)).toContain("https://example.com/recipe");
    expect(JSON.stringify(exported.data)).toContain('"total_time_minutes":0');
    const latest = edited.snapshot.savedMeals.find(item => item.id === meal.id)!;
    const clearedReference = { ...latest, reference: "", totalTimeMinutes: undefined, sourceUrl: "https://example.com/legacy-source" };
    await userA.repository.saveRecipe({ meal: clearedReference, newFoods: [], currentSnapshot: edited.snapshot, idempotencyKey: randomUUID() });
    expect((await userA.repository.load())!.savedMeals.find(item => item.id === meal.id)?.reference).toBeUndefined();
    expect((await userA.repository.load())!.savedMeals.find(item => item.id === meal.id)?.totalTimeMinutes).toBeUndefined();
  });

  it("persists Pilates and carb-limited future plans without changing completed history", async () => {
    const account = await createAccount();
    const empty = await account.repository.load();
    if (!empty) throw new Error("Missing local snapshot");
    const onboarded = await account.repository.completeOnboarding({ profile: { ...profile(account.id, "MVP3 plans"), trainingProgram: "pilates", dietaryPattern: "Keto-style", cookingTimeMinutes: 30 }, currentSnapshot: empty, idempotencyKey: randomUUID() });
    expect(onboarded.snapshot.profile?.trainingProgram).toBe("pilates");
    expect(onboarded.snapshot.plan?.trainingProgram).toBe("pilates");
    expect(onboarded.snapshot.target?.carbsG).toBeLessThanOrEqual(50);
    expect(onboarded.snapshot.nutritionWeekTargets).toHaveLength(1);
    expect(onboarded.snapshot.nutritionWeekTargets[0]).toEqual(onboarded.snapshot.target);
    const meals = onboarded.snapshot.mealPlan!.meals;
    expect(meals.filter((meal) => Boolean(meal.foodId || meal.mealId))).toHaveLength(21);
    expect(meals.filter(meal => meal.slot === "breakfast").every(meal => !meal.mealId)).toBe(true);
    for (const date of new Set(meals.map((meal) => meal.date))) expect(meals.filter((meal) => meal.date === date).reduce((sum, meal) => sum + (meal.expectedCarbsG ?? 0), 0)).toBeLessThanOrEqual(50);
    const started = await account.repository.startSession({ workoutId: onboarded.snapshot.plan!.workouts[0].id, currentSnapshot: onboarded.snapshot, idempotencyKey: randomUUID() });
    const session = started.snapshot.sessions[0];
    const logged = await account.repository.saveSession({ session: completedSession(started.snapshot, session), currentSnapshot: started.snapshot, idempotencyKey: randomUUID() });
    const finished = await account.repository.finishSession({ session: logged.snapshot.sessions.find((item) => item.id === session.id)!, currentSnapshot: logged.snapshot, idempotencyKey: randomUUID() });
    expect(finished.snapshot.sessions[0].trainingProgram).toBe("pilates");
    const selected = await account.repository.selectTrainingProgram({ program: "calisthenics", currentSnapshot: finished.snapshot, idempotencyKey: randomUUID() });
    expect(selected.snapshot.plan?.trainingProgram).toBe("calisthenics");
    expect(selected.snapshot.sessions[0]).toEqual(finished.snapshot.sessions[0]);
    const edited = structuredClone(selected.snapshot.mealPlan!);
    edited.meals[0] = { ...edited.meals[0], mealId: undefined, foodId: "food-mvp3-170567", servings: 20 };
    await expect(account.repository.editMealPlan({ mealPlan: edited, currentSnapshot: selected.snapshot, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "validation_failed" } });
  });

  it("reconciles planned recipe ingredients while retaining grocery overrides and recorded intake", async () => {
    const account = await createAccount();
    const empty = (await account.repository.load())!;
    const onboarded = await account.repository.completeOnboarding({ profile: profile(account.id, "Recipe groceries"), currentSnapshot: empty, idempotencyKey: randomUUID() });
    const logged = await account.repository.saveNutrition({ entry: eggEntry(todayKey()), idempotencyKey: randomUUID() });
    const food = { ...onboarded.snapshot.foods[0], id: `recipe-grocery-food-${randomUUID()}`, name: "Recipe grocery ingredient", unit: "g" as const, servingGrams: 100, servingLabel: "100 g", valueSource: "user_provided" as const, source: "User entered", sourceVersion: "1", fdcId: undefined, recordType: undefined };
    const meal = { id: `recipe-grocery-${randomUUID()}`, name: "Recipe groceries", mealSlots: ["breakfast" as const], complexity: "easy" as const, notes: "Combine and serve.", servings: 1, ingredients: [{ foodId: food.id, servings: 1 }] };
    const saved = await account.repository.saveRecipe({ meal, newFoods: [food], currentSnapshot: logged.snapshot, idempotencyKey: randomUUID() });
    const planned = await account.repository.addPlannedMeal({ plannedMeal: { id: `planned-${randomUUID()}`, date: todayKey(), slot: "breakfast", label: meal.name, mealId: meal.id, servings: 1 }, currentSnapshot: saved.snapshot, idempotencyKey: randomUUID() });
    const item = planned.snapshot.grocery!.items.find(item => item.name === food.name)!;
    expect(item.generatedQuantity).toBe(100);
    const checked = await account.repository.updateGrocery({ type: "toggle", itemId: item.id, expectedVersions: { groceryRevision: planned.snapshot.grocery!.revision }, idempotencyKey: randomUUID() }, planned.snapshot);
    const adjusted = await account.repository.updateGrocery({ type: "quantity", itemId: item.id, quantity: 75, expectedVersions: { groceryRevision: checked.snapshot.grocery!.revision }, idempotencyKey: randomUUID() }, checked.snapshot);
    const original = adjusted.snapshot.savedMeals.find(item => item.id === meal.id)!;
    const edited = await account.repository.saveRecipe({ meal: { ...original, ingredients: [{ foodId: food.id, servings: 2 }] }, newFoods: [], currentSnapshot: adjusted.snapshot, expectedVersions: { recordRevision: original.revision, groceryRevision: adjusted.snapshot.grocery!.revision }, idempotencyKey: randomUUID() });
    expect(edited.snapshot.grocery!.items.find(item => item.name === food.name)).toMatchObject({ generatedQuantity: 200, quantity: 75, checked: true });
    expect(edited.snapshot.nutritionLogs).toEqual(logged.snapshot.nutritionLogs);
    expect(edited.snapshot.mealPlan).toEqual(planned.snapshot.mealPlan);
    await expect(account.repository.saveRecipe({ meal: { ...original, name: "Stale recipe" }, newFoods: [], currentSnapshot: adjusted.snapshot, expectedVersions: { recordRevision: original.revision, groceryRevision: adjusted.snapshot.grocery!.revision }, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
  });

  it("keeps step retries, revisions, deletion and cross-user ownership consistent", async () => {
    const date = todayKey();
    const idempotencyKey = randomUUID();
    const saved = await userA.repository.saveDailySteps({ date, steps: 6500, walkingMinutes: 35, expectedRevision: 0, idempotencyKey });
    const replay = await userA.repository.saveDailySteps({ date, steps: 6500, walkingMinutes: 35, expectedRevision: 0, idempotencyKey });
    expect(replay.snapshot.dailySteps).toEqual(saved.snapshot.dailySteps);
    expect((await userB.client.from("daily_step_entries").select("*").eq("user_id",userA.id)).data).toEqual([]);
    expect((await userA.client.from("daily_step_entries").insert({ user_id: userA.id, entry_date: date, steps: 3 })).error).toBeTruthy();
    await expect(userA.repository.saveDailySteps({ date, steps: 3, expectedRevision: 0, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    const deleteKey = randomUUID();
    const removed = await userA.repository.deleteDailySteps({ date, expectedRevision: 1, idempotencyKey: deleteKey });
    const repeatDelete = await userA.repository.deleteDailySteps({ date, expectedRevision: 1, idempotencyKey: deleteKey });
    expect(repeatDelete.snapshot.dailySteps).toEqual(removed.snapshot.dailySteps);
    const replacement = await userA.repository.saveDailySteps({ date, steps: 0, expectedRevision: 0, idempotencyKey: randomUUID() });
    expect(replacement.snapshot.dailySteps.find((entry) => entry.date===date)?.revision).toBe(2);
    await expect(userA.repository.saveDailySteps({ date, steps: 500, expectedRevision: 1, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
  });

  it("versions custom routines and keeps immutable session prescriptions and actuals", async () => {
    const snapshot = await userA.repository.load();
    if (!snapshot?.profile) throw new Error("Missing profile");
    const id = randomUUID();
    const definition = { name: "My routine", movements: [{ id: "reach", name: "Gentle reach", sets: 2, reps: 6, restSeconds: 45 }] };
    const key = randomUUID();
    const saved = await userA.repository.saveCustomWorkout({ id, definition, expectedVersion: 0, profile: snapshot.profile, idempotencyKey: key });
    const replay = await userA.repository.saveCustomWorkout({ id, definition, expectedVersion: 0, profile: snapshot.profile, idempotencyKey: key });
    expect(replay.snapshot.customWorkouts).toEqual(saved.snapshot.customWorkouts);
    const startKey = randomUUID();
    const started = await userA.repository.startCustomWorkout({ id: `session-${startKey}`, workoutId: id, expectedVersion: 1, date: todayKey(), idempotencyKey: startKey });
    const session = started.snapshot.customSessions[0];
    const finished = await userA.repository.saveCustomSession({ id: session.id, expectedRevision: 1, actual: [{ movementId: "reach", sets: 2, reps: 6, status: "completed", rpe: 5, note: "Comfortable" }], status: "completed", idempotencyKey: randomUUID() });
    const changed = await userA.repository.saveCustomWorkout({ id, expectedVersion: 1, definition: { ...definition, movements: [{ ...definition.movements[0], reps: 8 }] }, profile: snapshot.profile, idempotencyKey: randomUUID() });
    expect(changed.snapshot.customWorkouts.find((routine) => routine.id===id)?.version).toBe(2);
    expect(changed.snapshot.customSessions[0]).toEqual(finished.snapshot.customSessions[0]);
    expect(changed.snapshot.customSessions[0].planned.movements[0].reps).toBe(6);
    expect((await userB.client.from("current_custom_workouts").select("*").eq("user_id",userA.id)).data).toEqual([]);
    await expect(userB.repository.startCustomWorkout({ id: randomUUID(), workoutId: id, expectedVersion: 2, date: todayKey(), idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "not_found" } });
    await expect(userA.repository.saveCustomWorkout({ id, expectedVersion: 1, definition, profile: snapshot.profile, idempotencyKey: randomUUID() })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    const exported = await userA.repository.exportData({ idempotencyKey: randomUUID() });
    expect(exported.data?.customWorkoutVersions.filter((row) => row.app_id===id)).toHaveLength(2);
    expect(exported.data?.customWorkoutSessions.find((row) => row.app_id===session.id)).toBeTruthy();
    expect(exported.data?.dailySteps.length).toBeGreaterThan(0);
  });

  it("rejects competing step, routine, and session edits without overwriting the winner", async () => {
    const snapshot = await userA.repository.load();
    if (!snapshot?.profile) throw new Error("Missing profile");
    const date = addDays(todayKey(), -3);
    await userA.repository.saveDailySteps({ date, steps: 100, expectedRevision: 0, idempotencyKey: randomUUID() });
    const assertOneWinner = (results: PromiseSettledResult<unknown>[]) => {
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      if (!rejected || rejected.status !== "rejected") throw new Error("Expected competing edit to be rejected");
      expect(rejected.reason).toMatchObject({ repositoryError: { code: "stale_version" } });
    };
    assertOneWinner(await Promise.allSettled([200, 300].map((steps) => userA.repository.saveDailySteps({ date, steps, expectedRevision: 1, idempotencyKey: randomUUID() }))));
    const observed = (await userA.repository.load())?.dailySteps.find((entry) => entry.date === date);
    expect(observed?.revision).toBe(2);
    expect([200, 300]).toContain(observed?.steps);
    const id = randomUUID();
    const definition = { name: "Concurrent routine", movements: [{ id: "reach", name: "Familiar reach", sets: 2, reps: 6, restSeconds: 45 }] };
    await userA.repository.saveCustomWorkout({ id, expectedVersion: 0, definition, profile: snapshot.profile, idempotencyKey: randomUUID() });
    assertOneWinner(await Promise.allSettled([7, 8].map((reps) => userA.repository.saveCustomWorkout({ id, expectedVersion: 1, definition: { ...definition, movements: [{ ...definition.movements[0], reps }] }, profile: snapshot.profile!, idempotencyKey: randomUUID() }))));
    const started = await userA.repository.startCustomWorkout({ id: randomUUID(), workoutId: id, expectedVersion: 2, date: todayKey(), idempotencyKey: randomUUID() });
    const session = started.snapshot.customSessions.find((item) => item.status === "in_progress");
    if (!session) throw new Error("Missing concurrent test session");
    assertOneWinner(await Promise.allSettled([6, 7].map((reps) => userA.repository.saveCustomSession({ id: session.id, expectedRevision: 1, status: "in_progress", actual: [{ movementId: "reach", sets: 2, reps, status: "modified" }], idempotencyKey: randomUUID() }))));
    const saved = (await userA.repository.load())?.customSessions.find((item) => item.id === session.id);
    expect(saved?.revision).toBe(2);
    expect(saved?.planned).toEqual(session.planned);
    expect([6, 7]).toContain(saved?.actual[0].reps);
    await userA.repository.saveCustomSession({ id: session.id, expectedRevision: 2, status: "abandoned", actual: saved!.actual, idempotencyKey: randomUUID() });
  });

  beforeAll(async () => {
    userA = await createAccount();
    userB = await createAccount();
    const empty = await userA.repository.load();
    if (!empty) throw new Error("Authenticated local account did not hydrate an initial snapshot.");
    expect(empty.nutritionWeekTargets).toEqual([]);
    initialA = empty;
    const onboarded = await userA.repository.completeOnboarding({
      profile: { ...profile(userA.id, "Repository Integration"), dailyStepTarget: 7500 },
      currentSnapshot: empty,
      idempotencyKey: `repo-onboard-${randomUUID()}`,
    });
    initialA = onboarded.snapshot;
    expect((await userA.repository.load())?.profile?.dailyStepTarget).toBe(7500);
  });

  afterAll(async () => {
    const failures: string[] = [];
    for (const account of [...accounts].reverse()) {
      try {
        await account.repository.deleteAccount({ confirmation: "DELETE", idempotencyKey: `repo-cleanup-${randomUUID()}` });
      } catch (reason) {
        failures.push(reason instanceof Error ? reason.message : "Unknown cleanup failure");
      }
    }
    if (failures.length) throw new Error(`Local integration account cleanup failed for ${failures.length} disposable account(s): ${failures.join("; ")}`);
  });

  it("hydrates the authenticated plan bundle, preserves history, and rejects stale edits", async () => {
    expect(initialA.onboarded).toBe(true);
    expect(initialA.profile?.id).toBe(userA.id);
    expect(initialA.plan?.workouts.length).toBeGreaterThan(0);
    expect(initialA.mealPlan?.meals.length).toBeGreaterThan(0);
    expect(initialA.grocery?.items.length).toBeGreaterThan(0);

    const staleClient = makeClient();
    const signedIn = await staleClient.auth.signInWithPassword({ email: userA.email, password: userA.password });
    expect(signedIn.error).toBeNull();
    const staleRepository = createSupabaseRepository(staleClient);
    const stale = await staleRepository.load();
    if (!stale?.profile) throw new Error("Second repository client did not hydrate the owner profile.");

    const current = await userA.repository.load();
    if (!current?.profile) throw new Error("Owner profile disappeared during the test.");
    const update = await userA.repository.updateProfile({
      profile: { ...current.profile, name: "Repository Updated" },
      currentSnapshot: current,
      idempotencyKey: `repo-name-${randomUUID()}`,
    });
    expect(update.snapshot.profile?.name).toBe("Repository Updated");

    const staleProfile = { ...stale.profile, name: "Must Not Win" };
    await expect(staleRepository.updateProfile({
      profile: staleProfile,
      currentSnapshot: stale,
      idempotencyKey: `repo-stale-${randomUUID()}`,
    })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    const latest = await userA.repository.load();
    expect(latest?.profile?.name).toBe("Repository Updated");
    await staleClient.auth.signOut();
  });

  it("finishes a workout against its original prescription and keeps that history after plan edits", async () => {
    const before = await userA.repository.load();
    if (!before?.plan?.workouts[0] || !before.profile) throw new Error("Workout plan fixture is missing.");
    const start = await userA.repository.startSession({
      workoutId: before.plan.workouts[0].id,
      currentSnapshot: before,
      idempotencyKey: `repo-session-start-${randomUUID()}`,
    });
    const active = start.snapshot.sessions.find((session) => session.status === "in_progress");
    if (!active) throw new Error("Workout session was not hydrated after start.");
    const finish = await userA.repository.finishSession({
      session: completedSession(start.snapshot, active),
      currentSnapshot: start.snapshot,
      idempotencyKey: `repo-session-finish-${randomUUID()}`,
    });
    const finished = finish.snapshot.sessions.find((session) => session.id === active.id);
    expect(finished?.status).toBe("completed");
    expect(finished?.plannedPlanVersion).toBe(before.plan.version);

    const latest = finish.snapshot;
    const changedProfile = { ...latest.profile!, sessionMinutes: latest.profile!.sessionMinutes === 45 ? 60 : 45 };
    const updated = await userA.repository.updateProfile({
      profile: changedProfile,
      currentSnapshot: latest,
      idempotencyKey: `repo-plan-update-${randomUUID()}`,
    });
    expect(updated.snapshot.plan?.version).toBeGreaterThan(before.plan.version);
    expect(updated.snapshot.sessions.find((session) => session.id === active.id)?.plannedPlanVersion).toBe(before.plan.version);
  });

  it("persists idempotent nutrition entries, paginates history, and isolates accounts", async () => {
    const dates = [0, -1, -2, -3].map((offset) => addDays(todayKey(), offset));
    const first = await userA.repository.saveNutrition({ entry: eggEntry(dates[0]), idempotencyKey: `repo-egg-${randomUUID()}` });
    const idempotentKey = `repo-replay-${randomUUID()}`;
    const saved = await userA.repository.saveNutrition({ entry: eggEntry(dates[1]), idempotencyKey: idempotentKey });
    const replay = await userA.repository.saveNutrition({ entry: eggEntry(dates[1]), idempotencyKey: idempotentKey });
    expect(replay.snapshot.nutritionLogs.filter((entry) => entry.date === dates[1])).toHaveLength(1);
    expect(first.snapshot.nutritionLogs.length).toBeGreaterThan(0);
    expect(saved.events[0]?.type).toBe("nutrition-entry-saved");
    await userA.repository.saveNutrition({ entry: eggEntry(dates[2]), idempotencyKey: `repo-egg-${randomUUID()}` });
    await userA.repository.saveNutrition({ entry: eggEntry(dates[3]), idempotencyKey: `repo-egg-${randomUUID()}` });

    const range = { from: dates[3], to: dates[0], limit: 2 };
    const pageOne = await userA.repository.loadHistory(range);
    expect(pageOne.nutritionLogs).toHaveLength(2);
    expect(pageOne.nextCursors.nutrition).toBeTruthy();
    const pageTwo = await userA.repository.loadHistory({ ...range, nutritionCursor: pageOne.nextCursors.nutrition });
    expect(pageTwo.nutritionLogs).toHaveLength(2);
    expect(new Set([...pageOne.nutritionLogs, ...pageTwo.nutritionLogs].map((entry) => entry.id)).size).toBe(4);

    const emptyB = await userB.repository.load();
    expect(emptyB?.profile).toBeNull();
    expect(emptyB?.nutritionLogs).toHaveLength(0);
  });

  it("changes only the daily step preference, supports retry, and rejects stale and cross-owner writes", async () => {
    const initial = await userA.repository.load();
    const observation = await userA.repository.saveDailySteps({ date: todayKey(), steps: 6500, walkingMinutes: 35, expectedRevision: initial?.dailySteps.find((entry) => entry.date === todayKey())?.revision ?? 0, idempotencyKey: `steps-${randomUUID()}` });
    const before = observation.snapshot;
    const revision = before.profile!.revision!;
    const key = `step-target-${randomUUID()}`;
    const input = { target: 8000, expectedRevision: revision, idempotencyKey: key };
    const saved = await userA.repository.setDailyStepTarget(input);
    const retry = await userA.repository.setDailyStepTarget(input);
    expect(saved.snapshot.profile?.dailyStepTarget).toBe(8000);
    expect(retry.snapshot.profile?.revision).toBe(saved.snapshot.profile?.revision);
    expect(saved.snapshot.plan).toEqual(before.plan);
    expect(saved.snapshot.mealPlan).toEqual(before.mealPlan);
    expect(saved.snapshot.target).toEqual(before.target);
    expect(saved.snapshot.dailySteps).toEqual(before.dailySteps);
    expect(saved.snapshot.sessions).toEqual(before.sessions);
    await expect(userA.repository.setDailyStepTarget({ target: 9000, expectedRevision: revision, idempotencyKey: `stale-target-${randomUUID()}` })).rejects.toMatchObject({ repositoryError: { code: "stale_version" } });
    const crossOwner = await userB.client.rpc("set_daily_step_target", { p_payload: { target: 9000, expectedRevision: saved.snapshot.profile!.revision!, userId: userA.id, idempotencyKey: `other-target-${randomUUID()}` } });
    expect(crossOwner.error).not.toBeNull();
    expect((await userA.repository.load())?.profile?.dailyStepTarget).toBe(8000);
    const anon = makeClient();
    const unauthenticated = await anon.rpc("set_daily_step_target", { p_payload: { ...input, idempotencyKey: `anon-${randomUUID()}` } });
    expect(unauthenticated.error).not.toBeNull();
    const directWrite = await userA.client.from("profiles").update({ daily_step_target: 9000 }).eq("id", userA.id);
    expect(directWrite.error).not.toBeNull();
    const { dailyStepTarget: omitted, ...oldProfile } = saved.snapshot.profile!;
    expect(omitted).toBe(8000);
    const renamed = await userA.repository.updateProfile({ profile: { ...oldProfile, name: "Target retained" }, currentSnapshot: saved.snapshot, idempotencyKey: `omit-${randomUUID()}` });
    expect(renamed.snapshot.profile?.dailyStepTarget).toBe(8000);
    const cleared = await userA.repository.setDailyStepTarget({ target: null, expectedRevision: renamed.snapshot.profile!.revision!, idempotencyKey: `clear-${randomUUID()}` });
    expect(cleared.snapshot.profile?.dailyStepTarget).toBeUndefined();
    expect(cleared.snapshot.dailySteps).toEqual(before.dailySteps);
  });

  it("serializes competing step targets and concurrent retries while preserving unrelated profile edits", async () => {
    const before = await userA.repository.load();
    if (!before?.profile) throw new Error("Missing profile");
    const revision = before.profile.revision!;
    const results = await Promise.allSettled([7000, 9000].map((target) => userA.repository.setDailyStepTarget({ target, expectedRevision: revision, idempotencyKey: randomUUID() })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (!rejected || rejected.status !== "rejected") throw new Error("Expected stale competing target");
    expect(rejected.reason).toMatchObject({ repositoryError: { code: "stale_version" } });
    const winner = await userA.repository.load();
    expect(winner?.profile?.revision).toBe(revision + 1);
    expect([7000, 9000]).toContain(winner?.profile?.dailyStepTarget);

    const retryInput = { target: 8000, expectedRevision: winner!.profile!.revision!, idempotencyKey: randomUUID() };
    const retries = await Promise.all([userA.repository.setDailyStepTarget(retryInput), userA.repository.setDailyStepTarget(retryInput)]);
    expect(retries[0].snapshot.profile).toEqual(retries[1].snapshot.profile);
    expect(retries[0].snapshot.profile?.revision).toBe(retryInput.expectedRevision + 1);
    const confirmed = retries[0].snapshot;
    const { dailyStepTarget: omitted, ...legacyProfile } = confirmed.profile!;
    expect(omitted).toBe(8000);
    // A plan-affecting profile update from an older client must retain the preference.
    const regenerated = await userA.repository.updateProfile({ profile: { ...legacyProfile, sessionMinutes: legacyProfile.sessionMinutes === 30 ? 45 : 30 }, currentSnapshot: confirmed, idempotencyKey: randomUUID() });
    expect(regenerated.snapshot.profile?.dailyStepTarget).toBe(8000);
    expect(regenerated.snapshot.dailySteps).toEqual(before.dailySteps);
    expect(regenerated.snapshot.sessions).toEqual(before.sessions);
    const exported = await userA.repository.exportData({ idempotencyKey: randomUUID() });
    expect(exported.data?.profile?.daily_step_target).toBe(8000);
  });

  it("reconciles generated groceries without losing custom entries", async () => {
    const snapshot = await userA.repository.load();
    if (!snapshot) throw new Error("Grocery owner snapshot is missing.");
    const customName = `Repository custom ${randomUUID().slice(0, 8)}`;
    const added = await userA.repository.addCustomGrocery({
      name: customName,
      quantity: 2,
      unit: "item",
      currentSnapshot: snapshot,
      idempotencyKey: `repo-grocery-${randomUUID()}`,
    });
    expect(added.snapshot.grocery?.items.some((item) => item.name === customName && item.custom)).toBe(true);

    const regenerated = await userA.repository.regenerateGrocery({
      currentSnapshot: added.snapshot,
      idempotencyKey: `repo-regenerate-${randomUUID()}`,
    });
    expect(regenerated.snapshot.grocery?.items.some((item) => item.name === customName && item.custom)).toBe(true);
  });
});
