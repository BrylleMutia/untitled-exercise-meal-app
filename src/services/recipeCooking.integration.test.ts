import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { cookingGroupRepository } from "./cookingGroupRepository";
import { providedRecipeLogEntry } from "@/utility/providedRecipeNutrition";
import { todayKey, startOfWeek, addDays } from "@/utility/dates";
import { nutritionWeekSnapshot } from "@/utility/nutritionWeek";
import { createSupabaseRepository } from "./supabaseRepository";
import type { Database } from "@/types/database.generated";
import type { Meal, UserProfile } from "@/types/domain";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (url !== "http://127.0.0.1:56321" || !key) throw new Error("Conversion integration tests require the disposable local Supabase stack.");
const makeClient = () => createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
const client = makeClient(), repository = createSupabaseRepository(client);
const credentials = { email: `conversions-${randomUUID()}@example.test`, password: `Local-${randomUUID()}-Pass!` };
let accountId = "";

beforeAll(async () => {
  const created = await client.auth.signUp(credentials);
  if (created.error || !created.data.user) throw created.error;
  accountId = created.data.user.id;
  if (!created.data.session) { const login = await client.auth.signInWithPassword(credentials); if (login.error) throw login.error; }
  const profile: UserProfile = { id: accountId, name: "Conversion test", age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [], notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
  await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: randomUUID() });
});
afterAll(async () => { if (accountId) { const result = await client.rpc("delete_account", { p_payload: { idempotencyKey: randomUUID() } }); if (result.error) throw result.error; } });


describe("cooking-only recipes", () => {
 it("saves and reloads whole-recipe macros without food records or weights", async () => {
  const recipe: Meal = { id: `meal-cooking-${randomUUID()}`, name: "Rice and onion", servings: 4, mealSlots: ["lunch"], complexity: "easy", notes: "Cook the rice and onion.", ingredients: [],
   nutritionInput: { method: "provided", basis: "whole-recipe", values: { calories: 1200, proteinG: 24, carbsG: 240, fatG: 12 } }, providedNutrition: { calories: 300, proteinG: 6, carbsG: 60, fatG: 3 },
   cookingIngredients: [{ id: "rice", cookingMeasurement: { kind: "amount", name: "Rice", quantity: 2, unit: "cup" } }, { id: "onion", cookingMeasurement: { kind: "amount", name: "Onion", quantity: 1, unit: "piece" } }] };
  const input = { meal: recipe, newFoods: [], currentSnapshot: (await repository.load())!, idempotencyKey: randomUUID() };
  await repository.saveRecipe(input);
  await repository.saveRecipe(input);
  const loaded = (await repository.load())!.savedMeals.find(item => item.id === recipe.id)!;
  expect(loaded.cookingIngredients).toEqual(recipe.cookingIngredients);
  expect(loaded.nutritionInput).toEqual(recipe.nutritionInput);
  expect(loaded.ingredients).toEqual([]);
  expect(loaded.providedNutrition).toEqual(recipe.providedNutrition);
  const base = (await repository.load())!;
  const date = todayKey();
  const week = await repository.loadNutritionWeek(startOfWeek(date, base.profile!.weekStartsOn));
  const planned = await repository.addPlannedMeal({ currentSnapshot: nutritionWeekSnapshot(base, week), plannedMeal: { id: randomUUID(), date, slot: "lunch", mealId: loaded.id, label: loaded.name, servings: 4 }, reviewAcknowledged: true, reviewPolicyVersion: "advisory_v1", expectedVersions: { profileRevision: base.profile!.revision, recordRevision: loaded.revision }, idempotencyKey: randomUUID() });
  const shopping = (await repository.loadNutritionWeek(week.weekOf)).grocery!;
  expect(shopping.items.find(item => item.name === "Rice")).toMatchObject({ quantity: 2, unit: "cup" });
  expect(shopping.items.find(item => item.name === "Onion")).toMatchObject({ quantity: 1, unit: "piece" });
  expect(planned.snapshot.savedMeals.some(item => item.id === loaded.id)).toBe(true);
  const rice = shopping.items.find(item => item.name === "Rice")!;
  const adjusted = await repository.updateGrocery({ type: "quantity", itemId: rice.id, quantity: 5, idempotencyKey: randomUUID() }, nutritionWeekSnapshot((await repository.load())!, await repository.loadNutritionWeek(week.weekOf)));
  const checked = await repository.updateGrocery({ type: "toggle", itemId: rice.id, idempotencyKey: randomUUID() }, adjusted.snapshot);
  const updatedRecipe = { ...loaded, cookingIngredients: loaded.cookingIngredients!.map(item => item.id === "rice" ? { ...item, cookingMeasurement: { ...item.cookingMeasurement, quantity: 3 } } : item) };
  await repository.saveRecipe({ meal: updatedRecipe, newFoods: [], currentSnapshot: checked.snapshot, idempotencyKey: randomUUID() });
  const regenerated = (await repository.loadNutritionWeek(week.weekOf)).grocery!;
  expect(regenerated.items.find(item => item.id === rice.id)).toMatchObject({ quantity: 5, generatedQuantity: 3, checked: true, unit: "cup" });
  await repository.saveSavedMealLog({ date, slot: "lunch", entries: [providedRecipeLogEntry(loaded, 1.5, date, "lunch")!], meal: loaded, recipeServings: 1.5, idempotencyKey: randomUUID() });
  const afterLog = (await repository.load())!;
  expect(afterLog.nutritionLogs.some(log => log.calories === 450)).toBe(true);
  expect(afterLog.loggedMeals.some(log => log.mealId === loaded.id)).toBe(true);
  const exported = await repository.exportData({ idempotencyKey: randomUUID() });
  expect(JSON.stringify(exported.data)).toContain("Rice and onion");
 });
 it("saves recipe-wide cooking rows with no loaded personal grocery or a stale transferred header", async () => {
  const recipe: Meal = { id: `meal-missing-grocery-${randomUUID()}`, name: "Potato without ingredient macros", servings: 2, mealSlots: ["dinner"], complexity: "easy", notes: "Cook the potatoes.", ingredients: [],
   nutritionInput: { method: "provided", basis: "whole-recipe", values: { calories: 777, proteinG: 13, carbsG: 155, fatG: 9 } }, providedNutrition: { calories: 388.5, proteinG: 6.5, carbsG: 77.5, fatG: 4.5 },
   cookingIngredients: [{ id: "potato", cookingMeasurement: { kind: "amount", name: "Potato", quantity: 500, unit: "g" } }] };
  const base=(await repository.load())!;
  const currentSnapshot={...base,mealPlan:null,grocery:null};
  const saved=await repository.saveRecipe({meal:recipe,newFoods:[],currentSnapshot,expectedVersions:{groceryRevision:999999},idempotencyKey:randomUUID()});
  expect(saved.snapshot.savedMeals.find(item=>item.id===recipe.id)?.providedNutrition).toEqual(recipe.providedNutrition);
  const latest=saved.snapshot.savedMeals.find(item=>item.id===recipe.id)!;
  await repository.saveRecipe({meal:{...latest,notes:"Roast the potatoes.",cookingIngredients:latest.cookingIngredients!.map(item=>({...item,cookingMeasurement:{...item.cookingMeasurement,quantity:600}}))},newFoods:[],currentSnapshot:{...saved.snapshot,grocery:null},expectedVersions:{recordRevision:latest.revision,groceryRevision:999999},idempotencyKey:randomUUID()});
  const copy={...recipe,id:`meal-stale-grocery-${randomUUID()}`,name:"New recipe after transfer"};
  const transferredSnapshot={...base,grocery:{id:"missing-transferred-header",weekOf:"2026-10-12",revision:999999,items:[]}};
  await repository.saveRecipe({meal:copy,newFoods:[],currentSnapshot:transferredSnapshot,expectedVersions:{groceryRevision:999999},idempotencyKey:randomUUID()});
  expect((await repository.load())!.savedMeals.find(item=>item.id===copy.id)?.cookingIngredients).toEqual(recipe.cookingIngredients);
 });
 it("shares, batches native groceries, copies and retains a recipe after departure", async () => {
  const peer = makeClient();
  let peerId = "";
  try {
   const signed = await peer.auth.signUp({ email: `cooking-peer-${randomUUID()}@example.test`, password: `Local-${randomUUID()}-Pass!` });
   if (signed.error || !signed.data.user || !signed.data.session) throw signed.error ?? new Error("Peer session unavailable");
   peerId = signed.data.user.id;
   const peerRepository = createSupabaseRepository(peer);
   const ownerState = (await repository.load())!;
   const profile: UserProfile = { ...ownerState.profile!, id: peerId, name: "Cooking peer", createdAt: new Date().toISOString() };
   await peerRepository.completeOnboarding({ profile, currentSnapshot: (await peerRepository.load())!, idempotencyKey: randomUUID() });
   const ownerGroup = cookingGroupRepository(client), peerGroup = cookingGroupRepository(peer);
   const invite = await ownerGroup.command({ action: "invite", grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: randomUUID() });
   const inspected = await peerGroup.command({ action: "inspect-pin", pin: invite.pin! });
   await peerGroup.command({ action: "join", grocerySharingAcknowledgment: "all-weeks-v1", pin: invite.pin!, groupRevision: inspected.group!.revision, idempotencyKey: randomUUID() });
   const weekOf = addDays(startOfWeek(todayKey(), 0), 14);
   const connected = await ownerGroup.load(weekOf);
   const recipe = connected.recipes.find(item => item.name === "Rice and onion")!;
   expect(recipe.cookingIngredients).toHaveLength(2);
   const preview = await ownerGroup.preview({ reviewPolicyVersion: "advisory_v1", groupId: connected.group!.id, weekOf, memberIds: [accountId, peerId], selectedDates: [weekOf], mode: "fill", recipes: [{ id: recipe.id, revision: recipe.revision!, maxBatches: 2 }], seed: "native-cooking", overrides: {} });
   await ownerGroup.command({ action: "commit", previewId: preview.id, acknowledged: true, idempotencyKey: randomUUID() });
   const shared = await ownerGroup.load(weekOf);
   const batches = preview.batches.find(batch => batch.recipeId === recipe.id)!.batches;
   expect(shared.grocery!.items.find(item => item.name === "Rice")).toMatchObject({ unit: "cup", generatedQuantity: 3 * batches });
   expect(shared.grocery!.items.find(item => item.name === "Onion")).toMatchObject({ unit: "piece", generatedQuantity: batches });
   const copy = await peerGroup.command({ action: "copy-recipe", recipeId: recipe.id, idempotencyKey: randomUUID() });
   const copyMeal = (await peerRepository.load())!.savedMeals.find(item => item.id === copy.recipeId)!;
   expect(copyMeal.cookingIngredients).toHaveLength(2);
   await peerGroup.command({ action: "leave", groupId: shared.group!.id, groupRevision: shared.group!.revision, idempotencyKey: randomUUID() });
   await expect(peerGroup.recipe(recipe.id)).rejects.toThrow();
   expect((await peerRepository.load())!.savedMeals.find(item => item.id === copyMeal.id)?.providedNutrition).toEqual(recipe.providedNutrition);
  } finally { if (peerId) { const deleted = await peer.rpc("delete_account", { p_payload: { idempotencyKey: randomUUID() } }); if (deleted.error) throw deleted.error; } }
 });

});
