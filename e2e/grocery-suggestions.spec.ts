import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createLocalAccount, createAuthenticatedContext, deleteLocalAccount, type LocalAccount } from "./local-account";
import { createSupabaseRepository } from "../src/services/supabaseRepository";
import { cookingGroupRepository } from "../src/services/cookingGroupRepository";
import { nutritionWeekSnapshot } from "../src/utility/nutritionWeek";
import { startOfWeek, todayKey } from "../src/utility/dates";
import type { Database } from "../src/types/database.generated";
import type { UserProfile } from "../src/types/domain";

async function onboard(account: LocalAccount, name: string) {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword(account); if (login.error || !login.data.user) throw login.error;
  const repository = createSupabaseRepository(client);
  const profile: UserProfile = { id: login.data.user.id, name, age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [], notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
  await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: crypto.randomUUID() });
  return { repository, group: cookingGroupRepository(client) };
}

async function keyboardAndGeometry(page: Page, label: string, output: string) {
  const name = page.getByRole("combobox", { name: label, exact: true });
  await name.fill("chi"); await expect(page.getByRole("listbox", { name: "Grocery item suggestions" })).toBeVisible();
  expect(await page.getByRole("listbox", { name: "Grocery item suggestions" }).getByRole("option").count()).toBeLessThanOrEqual(6);
  await name.press("ArrowDown"); const selected = await page.getByRole("listbox", { name: "Grocery item suggestions" }).getByRole("option", { selected: true }).innerText();
  await name.press("Enter"); await expect(name).toHaveValue(selected); await expect(name).toBeFocused(); await expect(name).toHaveAttribute("aria-expanded", "false");
  await name.fill("mil"); await expect(name).toHaveAttribute("aria-expanded", "true");
  await name.press("Escape"); await expect(name).toHaveValue("mil"); await expect(name).toHaveAttribute("aria-expanded", "false");
  await name.fill("milk"); await expect(name).toHaveAttribute("aria-expanded", "true");
  const enlarged = await page.addStyleTag({ content: "html { font-size: 200% !important }" });
  const list = page.getByRole("listbox", { name: "Grocery item suggestions" });
  await name.scrollIntoViewIfNeeded();
  await expect.poll(async () => list.evaluate(element => { const r = element.parentElement!.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth; })).toBe(true);
  for (const option of await list.getByRole("option").all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await enlarged.evaluate(element => (element as HTMLStyleElement).remove());
  await name.scrollIntoViewIfNeeded();
  await expect.poll(async () => list.evaluate(element => { const r = element.parentElement!.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; })).toBe(true);
  await page.screenshot({ path: output });
  await name.press("Tab"); await expect(name).toHaveValue("milk"); await expect(name).toHaveAttribute("aria-expanded", "false");
  await name.focus(); await name.dispatchEvent("compositionstart"); await name.fill("ch");
  await expect(name).toHaveAttribute("aria-expanded", "false");
  await name.dispatchEvent("keydown", { key: "Enter", isComposing: true, keyCode: 229 }); await expect(name).toHaveValue("ch");
  await name.dispatchEvent("compositionend");
}

test("personal name suggestions fill only the name and tolerate stale and failed history reads", async ({ browser }, info) => {
  const account = await createLocalAccount("suggest-personal"), owner = await onboard(account, "Suggestion shopper");
  const weekOf = startOfWeek(todayKey(), 0), week = await owner.repository.loadNutritionWeek(weekOf);
  const current = nutritionWeekSnapshot((await owner.repository.load())!, week);
  await owner.repository.addCustomGrocery({ name: "Brand UHT milk", quantity: 2, unit: "l", categoryChoice: { category: "Dairy", preference: { action: "remember", expectedRevision: 0 } }, currentSnapshot: { ...current, grocery: current.grocery ?? { id: `gl-${weekOf}`, weekOf, items: [] } }, idempotencyKey: crypto.randomUUID() });
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account), page = await context.newPage();
  try {
    await page.setViewportSize({ width: info.project.name === "mobile" ? 412 : 1440, height: 930 }); await page.goto("/grocery");
    const name = page.getByRole("combobox", { name: "Extra grocery item name", exact: true });
    await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("3.5"); await page.getByRole("combobox", { name: "Unit", exact: true }).selectOption("kg");
    const writes: string[] = []; page.on("request", request => { if (request.url().endsWith("/rpc/add_custom_grocery_item")) writes.push(request.url()); });
    await name.fill("brand"); await page.getByRole("option", { name: "Brand UHT milk", exact: true }).click();
    await expect(name).toHaveValue("Brand UHT milk"); await expect(name).toBeFocused();
    await expect(page.getByRole("textbox", { name: "Quantity", exact: true })).toHaveValue("3.5"); await expect(page.getByRole("combobox", { name: "Unit", exact: true })).toHaveValue("kg");
    await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveValue("Dairy");
    await expect(page.getByRole("listitem", { name: "Brand UHT milk", exact: true })).toHaveCount(1);
    await keyboardAndGeometry(page, "Extra grocery item name", `output/grocery-suggestions-personal-${info.project.name}.png`);
    expect(writes).toHaveLength(0);
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/rest/v1/rpc/get_grocery_name_suggestions", async route => {
      if (route.request().postDataJSON().p_query === "zz") { await held; await route.fulfill({ json: [{ name: "ZZ stale", occurrences: 1, lastSeenWeek: weekOf }] }); }
      else await route.continue();
    });
    const pending = page.waitForRequest(request => request.url().endsWith("/rpc/get_grocery_name_suggestions") && request.postDataJSON().p_query === "zz");
    await name.fill("zz"); await pending; await name.fill("milk"); release();
    await expect(page.getByRole("option", { name: "Milk", exact: true })).toBeVisible(); await expect(page.getByRole("option", { name: "ZZ stale", exact: true })).toHaveCount(0); await expect(name).toHaveValue("milk");
    await page.unroute("**/rest/v1/rpc/get_grocery_name_suggestions");
    await page.route("**/rest/v1/rpc/get_grocery_name_suggestions", route => route.abort());
    await name.fill("coconut"); await expect(page.getByRole("button", { name: "Retry past items", exact: true })).toBeVisible();
    await page.getByRole("option", { name: "Coconut milk", exact: true }).click(); await expect(name).toHaveValue("Coconut milk");
    await page.unroute("**/rest/v1/rpc/get_grocery_name_suggestions");
    await name.fill("brand"); await page.getByRole("option", { name: "Brand UHT milk", exact: true }).click();
    await page.reload(); await expect(name).toHaveValue("Brand UHT milk"); await expect(name).toHaveAttribute("aria-expanded", "false");
    let lostResponse = false; const retryKeys: string[] = [];
    await page.route("**/rest/v1/rpc/add_custom_grocery_item", async route => {
      retryKeys.push(route.request().postDataJSON().p_payload.idempotencyKey);
      const response = await route.fetch();
      if (!lostResponse && response.ok()) { lostResponse = true; await route.abort(); }
      else await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Add custom grocery item", exact: true }).click();
    await expect(page.getByRole("listitem", { name: "Brand UHT milk", exact: true })).toHaveCount(2);
    await expect(name).toBeEnabled(); await name.focus();
    await page.getByRole("option", { name: "Brand UHT milk", exact: true }).click();
    await page.getByRole("button", { name: "Add custom grocery item", exact: true }).click();
    await expect(page.getByText("3.5 kg Brand UHT milk added to Dairy.", { exact: true })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Brand UHT milk", exact: true })).toHaveCount(2); expect(writes).toHaveLength(2);
    expect(retryKeys).toHaveLength(2); expect(retryKeys[0]).toBe(retryKeys[1]);
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("shared history suggestions remain scoped and Enter selects without adding", async ({ browser }, info) => {
  const a = await createLocalAccount("suggest-group-a"), b = await createLocalAccount("suggest-group-b");
  const owner = await onboard(a, "Suggestion Alice"), peer = await onboard(b, "Suggestion Bea");
  const invite = await owner.group.command({ action: "invite", grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: crypto.randomUUID() });
  const review = await peer.group.command({ action: "inspect-pin", pin: invite.pin! });
  await peer.group.command({ action: "join", pin: invite.pin!, groupRevision: review.group!.revision, grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: crypto.randomUUID() });
  const weekOf = startOfWeek(todayKey(), 0), week = await owner.group.load(weekOf);
  await owner.group.command({ action: "grocery", groupId: week.group!.id, weekOf, revision: week.revision, operation: "add", name: "Group special noodles", quantity: 500, unit: "g", idempotencyKey: crypto.randomUUID() });
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, b), page = await context.newPage();
  try {
    await page.setViewportSize({ width: info.project.name === "mobile" ? 412 : 1440, height: 930 }); await page.goto("/grocery");
    const name = page.getByRole("combobox", { name: "Extra grocery item", exact: true });
    const writes: string[] = []; page.on("request", request => { if (request.url().endsWith("/rpc/mutate_cooking_group_week") && request.postDataJSON().p_payload.operation === "add") writes.push(request.url()); });
    await keyboardAndGeometry(page, "Extra grocery item", `output/grocery-suggestions-shared-${info.project.name}.png`);
    await name.fill("group special"); await expect(page.getByRole("option", { name: "Group special noodles", exact: true })).toBeVisible(); await name.press("Enter"); await expect(page.getByRole("listitem", { name: "Group special noodles", exact: true })).toHaveCount(1); expect(writes).toHaveLength(0);
    await name.press("ArrowDown"); await expect(page.getByRole("option", { name: "Group special noodles", exact: true })).toBeVisible(); await name.press("Enter");
    await expect(name).toHaveValue("Group special noodles"); await expect(name).toBeFocused(); expect(writes).toHaveLength(0);
    await page.getByRole("textbox", { name: "Extra item quantity", exact: true }).fill("2");
    await page.getByRole("button", { name: "Add extra item", exact: true }).click();
    await expect(page.getByText("2 pcs Group special noodles added to Other.", { exact: true })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Group special noodles", exact: true })).toHaveCount(2); expect(writes).toHaveLength(1);
  } finally { await context.close(); await deleteLocalAccount(b); await deleteLocalAccount(a); }
});
