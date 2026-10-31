import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRepository } from "./supabaseRepository";
import type { Database } from "@/types/database.generated";
import type { Food, Meal, UserProfile } from "@/types/domain";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (url !== "http://127.0.0.1:56321" || !key) throw new Error("Conversion integration tests require the disposable local Supabase stack.");
const makeClient = () => createClient<Database>(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
const client = makeClient(), repository = createSupabaseRepository(client);
const credentials = { email: `conversions-${randomUUID()}@example.test`, password: `Local-${randomUUID()}-Pass!` };
let accountId = "";
const food: Food = { id: `food-conversion-${randomUUID()}`, name: "Conversion test food", servingLabel: "100 g", servingGrams: 100, unit: "g", calories: 100, proteinG: 5, carbsG: 10, fatG: 5, source: "User entered", sourceVersion: "1", valueSource: "user_provided", estimated: true, confidence: "medium", category: "Other", preparationBasis: "raw" };
const meal: Meal = { id: `meal-conversion-${randomUUID()}`, name: "Reusable conversion recipe", servings: 2, mealSlots: ["lunch"], complexity: "easy", notes: "Prepare safely.", ingredients: [{ foodId: food.id, servings: 1, cookingMeasurement: { kind: "amount", quantity: 100, unit: "g", gramsPerUnit: 1, conversionBases: [{ unit: "cup", gramsPerUnit: 80 }, { unit: "piece", gramsPerUnit: 25 }] } }] };
beforeAll(async () => {
  const created = await client.auth.signUp(credentials);
  if (created.error || !created.data.user) throw created.error;
  accountId = created.data.user.id;
  if (!created.data.session) { const login = await client.auth.signInWithPassword(credentials); if (login.error) throw login.error; }
  const profile: UserProfile = { id: accountId, name: "Conversion test", age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [], notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
  await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: randomUUID() });
});
afterAll(async () => { if (accountId) { const result = await client.rpc("delete_account", { p_payload: { idempotencyKey: randomUUID() } }); if (result.error) throw result.error; } });

describe("durable recipe conversion parity", () => {
  it("saves alternatives once under concurrent retries and reuses them from a fresh session", async () => {
    const input = { meal, newFoods: [food], currentSnapshot: (await repository.load())!, idempotencyKey: randomUUID() };
    await Promise.all([repository.saveRecipe(input), repository.saveRecipe(input)]);
    const fresh = makeClient();
    const login = await fresh.auth.signInWithPassword(credentials); if (login.error) throw login.error;
    const candidates = await createSupabaseRepository(fresh).loadIngredientConversions([food.id]);
    expect(candidates.filter(item => item.unit === "cup")).toHaveLength(1);
    expect(candidates).toEqual(expect.arrayContaining([expect.objectContaining({ unit: "cup", gramsPerUnit: 80 }), expect.objectContaining({ unit: "piece", gramsPerUnit: 25 })]));
    const saved = (await repository.load())!.savedMeals.find(item => item.id === meal.id)!;
    expect(saved.ingredients[0].cookingMeasurement?.conversionBases).toHaveLength(2);
    await fresh.auth.signOut();
  });
  it("retains knowledge when the source is archived and exports it without client write access", async () => {
    await repository.archiveMeal({ mealId: meal.id, currentSnapshot: (await repository.load())!, idempotencyKey: randomUUID() });
    expect(await repository.loadIngredientConversions([food.id])).toEqual(expect.arrayContaining([expect.objectContaining({ unit: "cup", gramsPerUnit: 80 })]));
    const exported = await repository.exportData({ idempotencyKey: randomUUID() });
    expect(exported.data?.ingredientConversions).toEqual(expect.arrayContaining([expect.objectContaining({ unit: "cup", grams_per_unit: 80 })]));
    const direct = await client.from("ingredient_conversions").delete().eq("user_id", accountId);
    expect(direct.error).not.toBeNull();
  });
});
