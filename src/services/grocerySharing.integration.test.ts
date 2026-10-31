import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookingGroupRepository } from "./cookingGroupRepository";
import { createSupabaseRepository } from "./supabaseRepository";
import { nutritionWeekSnapshot } from "@/utility/nutritionWeek";
import { addDays, startOfWeek, todayKey } from "@/utility/dates";
import type { Database } from "@/types/database.generated";
import type { UserProfile } from "@/types/domain";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (url !== "http://127.0.0.1:56321" || !key) throw new Error("Grocery sharing tests require isolated local Supabase.");
const clients: SupabaseClient<Database>[] = [];
async function account(name: string) {
  const client = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signUp({ email: `groceries-${randomUUID()}@example.test`, password: `Local-${randomUUID()}-Pass!` });
  if (error || !data.user || !data.session) throw error ?? new Error("No local session");
  clients.push(client);
  const repository = createSupabaseRepository(client), group = cookingGroupRepository(client);
  const profile: UserProfile = { id: data.user.id, name, age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [], notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
  await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: randomUUID() });
  async function context(weekOf: string) { return nutritionWeekSnapshot((await repository.load())!, await repository.loadNutritionWeek(weekOf)); }
  async function extra(weekOf: string, name: string) {
    const current = await context(weekOf);
    return repository.addCustomGrocery({ name, quantity: 2.5, unit: "kg", currentSnapshot: { ...current, grocery: current.grocery ?? { id: `gl-${weekOf}`, weekOf, items: [] } }, idempotencyKey: randomUUID() });
  }
  async function amount(weekOf: string, totalAmountCentavos: number | null) {
    const current = await context(weekOf);
    return repository.setGroceryTotalAmount({ weekOf, totalAmountCentavos, calendarRevision: current.profile!.calendarRevision!, expectedVersions: { groceryRevision: current.grocery?.revision ?? 0 }, currentSnapshot: current, idempotencyKey: randomUUID() });
  }
  return { client, repository, group, context, extra, amount, id: data.user.id };
}
async function connect(a: Awaited<ReturnType<typeof account>>, b: Awaited<ReturnType<typeof account>>) {
  const invite = await a.group.command({ action: "invite", grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: randomUUID() });
  const review = await b.group.command({ action: "inspect-pin", pin: invite.pin! });
  await b.group.command({ action: "join", grocerySharingAcknowledgment: "all-weeks-v1", pin: invite.pin!, groupRevision: review.group!.revision, idempotencyKey: randomUUID() });
}
afterAll(async () => { for (const client of clients.reverse()) { const { error } = await client.rpc("delete_account", { p_payload: { idempotencyKey: randomUUID() } }); if (error) throw error; } });

describe("unified grocery ownership", () => {
  it("keeps future independent requirements synchronized and retains transferred purchases after leaving", async () => {
    const a = await account("Independent Alice"), b = await account("Independent Bea");
    const current = startOfWeek(todayKey(),0);
    let future = addDays(current,7);
    await connect(a,b);
    let week = await a.group.load(current);
    let status = (await a.group.command({ action:"share-groceries", groupId:week.group!.id,groupRevision:week.group!.revision,acknowledged:true,idempotencyKey:randomUUID() })).sharing!;
    while (status.next) status = (await a.group.command({ action:"transfer-grocery-week",groupId:week.group!.id,...status.next,idempotencyKey:randomUUID() })).sharing!;
    const peerWeek = await b.group.load(current);
    let peerStatus = peerWeek.grocerySharing!;
    while (peerStatus.next) peerStatus = (await b.group.command({action:"transfer-grocery-week",groupId:peerWeek.group!.id,...peerStatus.next,idempotencyKey:randomUUID()})).sharing!;
    const snapshot = await a.context(future), food = snapshot.foods.find(food => food.id === "food-rice") ?? snapshot.foods.find(food => food.servingGrams > 0)!;
    await a.repository.addPlannedMeal({ currentSnapshot:snapshot,plannedMeal:{ id:`pm-${randomUUID()}`,label:food.name,foodId:food.id,date:future,slot:"lunch",servings:1 },idempotencyKey:randomUUID() });
    week = await b.group.load(future);
    const requirement = week.grocery?.items.find(item => item.sourceOwner === a.id && item.name === food.name && !item.removed);
    expect(requirement).toBeDefined();
    await b.group.command({ action:"grocery",groupId:week.group!.id,weekOf:future,revision:week.revision,operation:"quantity",itemId:requirement!.id,quantity:777,idempotencyKey:randomUUID() });
    week = await b.group.load(future);
    await b.group.command({ action:"grocery",groupId:week.group!.id,weekOf:future,revision:week.revision,operation:"refresh",idempotencyKey:randomUUID() });
    expect((await a.group.load(future)).grocery?.items.find(item => item.id === requirement!.id)?.quantity).toBe(777);
    week = await a.group.load(future);
    const proposed = await a.group.command({action:"propose-week",day:1,groupRevision:week.group!.revision,idempotencyKey:randomUUID()});
    await b.group.command({action:"vote-week",proposalId:proposed.group!.proposal!.id,approve:true,groupRevision:proposed.group!.revision,idempotencyKey:randomUUID()});
    future = startOfWeek(future,1);
    week = await a.group.load(future);
    expect(week.grocerySharing?.remaining).toBe(0);
    await a.group.command({action:"grocery",groupId:week.group!.id,weekOf:future,revision:week.revision,operation:"refresh",idempotencyKey:randomUUID()});
    week = await a.group.load(future);
    expect(week.grocery?.items.filter(item=>item.sourceOwner===a.id && item.name===food.name)).toHaveLength(1);
    expect(week.grocery?.items.find(item=>item.id===requirement!.id)?.quantity).toBe(777);
    week = await a.group.load(future);
    await a.group.command({ action:"leave",groupId:week.group!.id,groupRevision:week.group!.revision,idempotencyKey:randomUUID() });
    expect((await b.group.load(future)).grocery?.items.find(item => item.id === requirement!.id)?.quantity).toBe(777);
    expect((await a.repository.loadNutritionWeek(future)).grocery).toBeNull();
    await a.extra(future,"New personal purchase after leaving");
    expect((await a.repository.loadNutritionWeek(future)).grocery?.items.some(item=>item.name==="New personal purchase after leaving")).toBe(true);
  },90000);

  it("rejects stale transfers and overflow without losing a week, then resumes safely", async () => {
    const a = await account("Retry Alice"), b = await account("Retry Bea");
    const current = startOfWeek(todayKey(),0);
    await a.extra(current,"Saved extra"); await a.amount(current,100);
    await connect(a,b);
    let week = await a.group.load(current);
    const gid = week.group!.id;
    let status = (await a.group.command({ action:"share-groceries",groupId:gid,groupRevision:week.group!.revision,acknowledged:true,idempotencyKey:randomUUID() })).sharing!;
    while (status.next && status.next.sourceWeek !== current) status = (await a.group.command({ action:"transfer-grocery-week",groupId:gid,...status.next,idempotencyKey:randomUUID() })).sharing!;
    const stale = { action:"transfer-grocery-week" as const,groupId:gid,...status.next!,idempotencyKey:randomUUID() };
    week = await b.group.load(current);
    await b.group.command({ action:"grocery",groupId:gid,weekOf:current,revision:week.revision,operation:"amount",amount:Number.MAX_SAFE_INTEGER,idempotencyKey:randomUUID() });
    await expect(a.group.command(stale)).rejects.toThrow(/changed/);
    status = (await a.group.load(current)).grocerySharing!;
    await expect(a.group.command({ action:"transfer-grocery-week",groupId:gid,...status.next!,idempotencyKey:randomUUID() })).rejects.toThrow(/exceeds/);
    week = await b.group.load(current);
    expect(week.grocery?.items.some(item => item.name === "Saved extra")).toBe(false);
    await b.group.command({ action:"grocery",groupId:gid,weekOf:current,revision:week.revision,operation:"amount",amount:0,idempotencyKey:randomUUID() });
    status = (await a.group.load(current)).grocerySharing!;
    while (status.next) status = (await a.group.command({ action:"transfer-grocery-week",groupId:gid,...status.next,idempotencyKey:randomUUID() })).sharing!;
    expect((await b.group.load(current)).grocery?.totalAmountCentavos).toBe(100);
    expect(status.status).toBe("enabled");
  },90000);

  it("shares only the caller's history, adds amounts once, preserves duplicate rows and blocks legacy writes", async () => {
    const a = await account("Grocery Alice"), b = await account("Grocery Bea"), outsider = await account("Grocery Outsider");
    const current = startOfWeek(todayKey(), 0), past = addDays(current, -21);
    await a.extra(current, "Rice"); await a.amount(current, 125050);
    let personal = await a.context(current);
    const riceId = personal.grocery!.items.find(item=>item.name === "Rice")!.id;
    await a.repository.updateGrocery({type:"toggle",itemId:riceId,idempotencyKey:randomUUID()},personal);
    personal = await a.context(current);
    await a.repository.updateGrocery({type:"quantity",itemId:riceId,quantity:3.75,idempotencyKey:randomUUID()},personal);
    await a.extra(past, "Historical purchase"); await a.amount(past, 0);
    await b.extra(current, "Still private");
    await connect(a, b);
    let week = await a.group.load(current);
    const gid = week.group!.id;
    await a.group.command({ action: "grocery", groupId: gid, weekOf: current, revision: week.revision, operation: "add", name: "Rice", quantity: 1, unit: "kg", idempotencyKey: randomUUID() });
    week = await a.group.load(current);
    await a.group.command({ action: "grocery", groupId: gid, weekOf: current, revision: week.revision, operation: "amount", amount: 1000, idempotencyKey: randomUUID() });
    week = await a.group.load(current);
    await expect(outsider.group.command({ action: "share-groceries", groupId: gid, groupRevision: week.group!.revision, acknowledged: true, idempotencyKey: randomUUID() })).rejects.toThrow();
    const consent = { action: "share-groceries" as const, groupId: gid, groupRevision: week.group!.revision, acknowledged: true, idempotencyKey: randomUUID() };
    let status = (await a.group.command(consent)).sharing!;
    expect(status.status).toBe("transferring");
    let replay;
    while (status.next) {
      const command = { action: "transfer-grocery-week" as const, groupId: gid, ...status.next, idempotencyKey: randomUUID() };
      replay = command;
      status = (await a.group.command(command)).sharing!;
    }
    expect(status.status).toBe("enabled");
    if (replay) await a.group.command(replay);
    week = await b.group.load(current);
    expect(week.grocery?.totalAmountCentavos).toBe(126050);
    expect(week.grocery?.items.filter(item => item.name === "Rice")).toHaveLength(2);
    expect(week.grocery?.items.find(item=>item.sourceOwner===a.id && item.name==="Rice")).toMatchObject({quantity:3.75,checked:true,unit:"kg"});
    expect(week.grocery?.items.some(item => item.name === "Still private")).toBe(false);
    expect((await b.group.load(past)).grocery?.totalAmountCentavos).toBe(0);
    expect((await a.repository.loadNutritionWeek(current)).grocery?.revision).toBeGreaterThan(0);
    await expect(a.extra(current, "Old client write")).rejects.toThrow(/shared.*refresh|refresh.*shared/i);
    await a.group.command({ action: "grocery", groupId: gid, weekOf: current, revision: week.revision, operation: "refresh", idempotencyKey: randomUUID() });
    expect((await b.group.load(current)).grocery?.items.filter(item => item.name === "Rice")).toHaveLength(2);
    const anonymous = createClient<Database>(url, key, { auth: { persistSession: false } });
    expect((await anonymous.rpc("get_grocery_sharing_status")).error).not.toBeNull();
    expect((await a.client.from("cooking_group_weeks").update({ grocery: { items: [] } }).eq("group_id", gid)).error).not.toBeNull();
  }, 90000);
});
