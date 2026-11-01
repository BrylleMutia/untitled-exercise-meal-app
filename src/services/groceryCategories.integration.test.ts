import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { cookingGroupRepository } from "./cookingGroupRepository";
import { createSupabaseRepository } from "./supabaseRepository";
import { nutritionWeekSnapshot } from "@/utility/nutritionWeek";
import { startOfWeek, todayKey } from "@/utility/dates";
import type { Database } from "@/types/database.generated";
import type { UserProfile } from "@/types/domain";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (url !== "http://127.0.0.1:56321" || !key) throw new Error("Category tests require isolated local Supabase.");
const clients: ReturnType<typeof createClient<Database>>[] = [];
async function account(name: string) {
  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); clients.push(client);
  const { data, error } = await client.auth.signUp({ email: `categories-${randomUUID()}@example.test`, password: `Local-${randomUUID()}-Pass!` });
  if (error || !data.user || !data.session) throw error ?? new Error("No local session");
  const repository = createSupabaseRepository(client), group = cookingGroupRepository(client);
  const profile: UserProfile = { id: data.user.id, name, age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [], notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
  await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: randomUUID() });
  const weekOf = startOfWeek(todayKey(), 0);
  async function context() { return nutritionWeekSnapshot((await repository.load())!, await repository.loadNutritionWeek(weekOf)); }
  return { client, repository, group, weekOf, context };
}
afterAll(async () => { for (const client of clients.reverse()) { const { error } = await client.rpc("delete_account", { p_payload: { idempotencyKey: randomUUID() } }); if (error) throw error; } });

describe("durable grocery categories", () => {
  it("learns only saved corrections, retries once, moves and resets without losing item state", async () => {
    const owner = await account("Category Alice");
    let current = await owner.context();
    const input = { name: "tomatos", quantity: 2, unit: "pcs", categoryChoice: { category: "Produce" as const, preference: { action: "remember" as const, expectedRevision: 0 } }, currentSnapshot: { ...current, grocery: current.grocery ?? { id: `gl-${owner.weekOf}`, weekOf: owner.weekOf, items: [] } }, idempotencyKey: randomUUID() };
    const first = await owner.repository.addCustomGrocery(input);
    expect(first.groceryItem).toMatchObject({ name: "Tomatos", quantity: 2, category: "Produce" });
    expect(await owner.repository.loadGroceryNameSuggestions("tom")).toContainEqual({ name: "Tomatos", occurrences: 1, lastSeenWeek: owner.weekOf });
    expect((await owner.repository.addCustomGrocery(input)).groceryItem).toEqual(first.groceryItem);
    expect(await owner.repository.loadGroceryCategoryPreferences()).toEqual([{ nameKey: "tomatos", category: "Produce", revision: 1 }]);
    current = await owner.context(); const item = current.grocery!.items.find(item => item.name === "Tomatos")!;
    await owner.repository.updateGrocery({ type: "toggle", itemId: item.id, idempotencyKey: randomUUID() }, current);
    current = await owner.context();
    const moved = await owner.repository.updateGrocery({ type: "quantity", itemId: item.id, quantity: 2.5, categoryChoice: { category: "Other", preference: { action: "remember", expectedRevision: 1 } }, idempotencyKey: randomUUID() }, current);
    expect(moved.previousCategory).toBe("Produce"); expect(moved.groceryItem).toMatchObject({ quantity: 2.5, category: "Other" });
    current = await owner.context(); expect(current.grocery!.items.find(row => row.id === item.id)).toMatchObject({ checked: true, category: "Other", quantity: 2.5, custom: true });
    await owner.repository.regenerateGrocery({ currentSnapshot: current, idempotencyKey: randomUUID() });
    current = await owner.context(); expect(current.grocery!.items.find(row => row.id === item.id)).toMatchObject({ checked: true, category: "Other", quantity: 2.5 });
    const failed = { ...input, idempotencyKey: randomUUID(), currentSnapshot: current };
    await expect(owner.repository.addCustomGrocery(failed)).rejects.toThrow(/category changed/i);
    expect((await owner.context()).grocery!.items.filter(row => row.name === "Tomatos")).toHaveLength(1);
    await owner.repository.updateGrocery({ type: "quantity", itemId: item.id, quantity: 2.5, categoryChoice: { category: "Produce", preference: { action: "reset", expectedRevision: 2 } }, idempotencyKey: randomUUID() }, current);
    expect(await owner.repository.loadGroceryCategoryPreferences()).toEqual([{ nameKey: "tomatos", category: null, revision: 3 }]);
    expect((await owner.repository.exportData()).data?.groceryCategoryPreferences).toHaveLength(1);
    current = await owner.context();
    const concurrent = await Promise.allSettled((["Dairy", "Pantry"] as const).map(category => owner.repository.updateGrocery({ type: "quantity", itemId: item.id, quantity: 2.5, categoryChoice: { category, preference: { action: "remember", expectedRevision: 3 } }, idempotencyKey: randomUUID() }, current)));
    expect(concurrent.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await owner.repository.loadGroceryCategoryPreferences())[0].revision).toBe(4);
    const other = await account("Category Bea"); expect(await other.repository.loadGroceryCategoryPreferences()).toEqual([]);
  });

  it("shares corrections within a group, preserves them through refresh and revokes departed members", async () => {
    const a = await account("Category group A"), b = await account("Category group B");
    const invitation = await a.group.command({ action: "invite", grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: randomUUID() });
    const review = await b.group.command({ action: "inspect-pin", pin: invitation.pin! });
    await b.group.command({ action: "join", grocerySharingAcknowledgment: "all-weeks-v1", pin: invitation.pin!, groupRevision: review.group!.revision, idempotencyKey: randomUUID() });
    let week = await a.group.load(a.weekOf); const groupId = week.group!.id;
    const input = { action: "grocery" as const, groupId, weekOf: a.weekOf, revision: week.revision, operation: "add" as const, name: "coconut milk", quantity: 1.5, unit: "l", categoryChoice: { category: "Pantry" as const, preference: { action: "remember" as const, expectedRevision: 0 } }, idempotencyKey: randomUUID() };
    const first = await a.group.command(input); expect(first.groceryItem).toMatchObject({ name: "Coconut milk", quantity: 1.5, category: "Pantry" });
    const originalAdder = (await a.context()).userId;
    expect(first.groceryItem?.addedByUserId).toBe(originalAdder);
    expect(await a.group.command(input)).toEqual(first);
    expect(await b.repository.loadGroceryNameSuggestions("milk", groupId)).toContainEqual({ name: "Coconut milk", occurrences: 1, lastSeenWeek: a.weekOf });
    expect(await b.repository.loadGroceryNameSuggestions("milk")).not.toContainEqual(expect.objectContaining({ name: "Coconut milk" }));
    expect(await b.repository.loadGroceryCategoryPreferences(groupId)).toEqual([{ nameKey: "coconut milk", category: "Pantry", revision: 1 }]);
    expect(await b.repository.loadGroceryCategoryPreferences()).toEqual([]);
    week = await b.group.load(b.weekOf);
    const moved = await b.group.command({ action: "grocery", groupId, weekOf: b.weekOf, revision: week.revision, operation: "quantity", itemId: first.groceryItem!.id, quantity: 1.5, categoryChoice: { category: "Other", preference: { action: "remember", expectedRevision: 1 } }, idempotencyKey: randomUUID() });
    expect(moved.previousCategory).toBe("Pantry"); expect(moved.groceryItem?.category).toBe("Other");
    expect(moved.groceryItem?.addedByUserId).toBe(originalAdder);
    week = await a.group.load(a.weekOf); await a.group.command({ action: "grocery", groupId, weekOf: a.weekOf, revision: week.revision, operation: "refresh", idempotencyKey: randomUUID() });
    expect((await a.group.load(a.weekOf)).grocery!.items.find(row => row.id === first.groceryItem!.id)?.category).toBe("Other");
    week = await a.group.load(a.weekOf);
    const actors = [a, b];
    const concurrent = await Promise.allSettled(actors.map((actor, index) => actor.group.command({ action: "grocery", groupId, weekOf: a.weekOf, revision: week.revision, operation: "add", name: `Concurrent extra ${index}`, quantity: 1, unit: "pcs", idempotencyKey: randomUUID() })));
    expect(concurrent.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter(result => result.status === "rejected")).toHaveLength(1);
    for (const [index, result] of concurrent.entries()) if (result.status === "fulfilled") expect(result.value.groceryItem?.addedByUserId).toBe((await actors[index].context()).userId);
    expect((await a.group.load(a.weekOf)).grocery!.items.find(row => row.id === first.groceryItem!.id)?.addedByUserId).toBe(originalAdder);
    week = await b.group.load(b.weekOf); await b.group.command({ action: "leave", groupId, groupRevision: week.group!.revision, idempotencyKey: randomUUID() });
    await expect(b.repository.loadGroceryNameSuggestions("milk", groupId)).rejects.toThrow(/Group not found/i);
    await expect(b.repository.loadGroceryCategoryPreferences(groupId)).rejects.toThrow(/Group not found/i);
    expect((await a.repository.loadGroceryCategoryPreferences(groupId))[0].category).toBe("Other");
  });
});
