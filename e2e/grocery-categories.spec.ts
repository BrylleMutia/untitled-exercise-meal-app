import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createLocalAccount, createAuthenticatedContext, deleteLocalAccount, type LocalAccount } from "./local-account";
import { createSupabaseRepository } from "../src/services/supabaseRepository";
import { cookingGroupRepository } from "../src/services/cookingGroupRepository";
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

async function checkAddAlignment(page: Page, shared: boolean, mobile: boolean) {
  const quantity = page.getByRole("textbox", { name: shared ? "Extra item quantity" : "Quantity", exact: true });
  const unit = page.getByRole("combobox", { name: shared ? "Extra item unit" : "Unit", exact: true });
  const add = page.getByRole("button", { name: shared ? "Add extra item" : "Add custom grocery item", exact: true });
  for (const [width, height] of [[426, 944], [412, 930], [1440, 930]]) {
    await page.setViewportSize({ width, height });
    const boxes = await Promise.all([quantity.boundingBox(), unit.boundingBox(), add.boundingBox()]);
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect(box!.height).toBe(48);
      expect(Math.abs(box!.y - boxes[0]!.y)).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 930 });
  const enlarged = await page.addStyleTag({ content: "html { font-size: 200% !important }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await enlarged.evaluate(element => element.parentNode?.removeChild(element));
  await page.setViewportSize({ width: mobile ? 412 : 1440, height: 930 });
}

test("category suggestions, remembered corrections, moves, reset and lookup recovery", async ({ browser }, info) => {
  const account = await createLocalAccount("category-personal"); await onboard(account, "Category shopper");
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account), page = await context.newPage();
  try {
    await page.setViewportSize({ width: info.project.name === "mobile" ? 412 : 1440, height: 930 });
    await page.goto("/grocery");
    const name = page.getByRole("combobox", { name: "Extra grocery item name", exact: true });
    const category = page.getByRole("combobox", { name: "Category", exact: true });
    await checkAddAlignment(page, false, info.project.name === "mobile");
    await name.fill("tomtaoes"); await expect(category).toHaveValue("Produce");
    await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("2");
    await page.getByRole("button", { name: "Add custom grocery item", exact: true }).click();
    await expect(page.getByText("2 pcs Tomtaoes added to Produce.", { exact: true })).toBeVisible();
    let row = page.getByRole("listitem", { name: "Tomtaoes", exact: true });
    await expect(row).toHaveAttribute("data-grocery-category", "Produce");
    await expect(row.getByText("Generated", { exact: true })).toHaveCount(0);
    await row.getByRole("button", { name: "Edit quantity for Tomtaoes", exact: true }).click();
    await row.getByRole("combobox", { name: "Category", exact: true }).selectOption("Other");
    await row.getByRole("button", { name: "Save quantity for Tomtaoes", exact: true }).click();
    await expect(page.getByText("2 pcs Tomtaoes moved to Other.", { exact: true })).toBeVisible();
    await expect(row).toHaveAttribute("data-grocery-category", "Other");
    await expect(row.getByRole("button", { name: "Edit quantity for Tomtaoes", exact: true })).toBeFocused();
    await name.fill("tomtaoes"); await expect(category).toHaveValue("Other");
    await expect(page.getByText("Using your saved category", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Use automatic category", exact: true }).click();
    await expect(category).toHaveValue("Produce");
    await page.getByRole("button", { name: "Add custom grocery item", exact: true }).click();
    await expect(page.getByText("1 pc Tomtaoes added to Produce.", { exact: true })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Tomtaoes", exact: true })).toHaveCount(2);
    let lostResponse = false;
    let releaseAdd!: () => void;
    const addPending = new Promise<void>(resolve => { releaseAdd = resolve; });
    await page.route("**/rest/v1/rpc/add_custom_grocery_item", async route => {
      await addPending;
      const response = await route.fetch();
      if (!lostResponse && response.ok()) { lostResponse = true; await route.abort(); }
      else await route.fulfill({ response });
    });
    await name.fill("bananna"); await page.getByRole("button", { name: "Add custom grocery item", exact: true }).click();
    const add = page.getByRole("button", { name: "Add custom grocery item", exact: true });
    try {
      await expect(add).toBeDisabled();
      await expect(add).toHaveAttribute("aria-busy", "true");
      await expect(add.locator(".lucide-loader-circle")).toBeVisible();
      await expect(add.locator(".lucide-plus")).toHaveCount(0);
    } finally { releaseAdd(); }
    await expect(page.getByRole("listitem", { name: "Bananna", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Add custom grocery item", exact: true })).toBeEnabled();
    await expect(add).toHaveAttribute("aria-busy", "false");
    await expect(add.locator(".lucide-plus")).toBeVisible();
    await page.getByRole("button", { name: "Add custom grocery item", exact: true }).click();
    await expect(page.getByText("1 pc Bananna added to Produce.", { exact: true })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Bananna", exact: true })).toHaveCount(1);
    await page.unroute("**/rest/v1/rpc/add_custom_grocery_item");
    await name.fill("fresh chicken breast"); await expect(category).toHaveValue("Protein");
    await name.fill("chicken seasoning"); await expect(category).toHaveValue("Pantry");
    await name.fill("A very long household item name that should wrap comfortably without moving the category control outside its card");
    await expect(category).toHaveValue("Other");
    const style = await page.addStyleTag({ content: "html { font-size: 200% !important }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await style.evaluate(element => (element as HTMLStyleElement).remove());
    await name.fill("coconut milk"); await expect(category).toHaveValue("Pantry");
    await page.getByRole("group", { name: "Extra grocery item", exact: true }).screenshot({ path: `output/grocery-categories-${info.project.name}.png` });
    await category.selectOption("Protein");
    await page.route("**/rest/v1/rpc/get_grocery_category_preferences", route => route.abort());
    await page.reload();
    await expect(page.getByText("Saved categories unavailable. Automatic suggestions still work.")).toBeVisible();
    await expect(category).toHaveValue("Protein");
    await page.unroute("**/rest/v1/rpc/get_grocery_category_preferences");
    await page.getByRole("button", { name: "Retry categories" }).click();
    await expect(page.getByText("Saved categories unavailable. Automatic suggestions still work.")).toHaveCount(0);
    row = page.getByRole("listitem", { name: "Tomtaoes", exact: true }).first();
    await row.getByRole("button", { name: "Edit quantity for Tomtaoes", exact: true }).click();
    await row.getByRole("combobox", { name: "Category", exact: true }).selectOption("Dairy");
    await row.getByRole("textbox", { name: "Quantity for Tomtaoes", exact: true }).press("Escape");
    await expect(row.getByRole("combobox", { name: "Category", exact: true })).toHaveCount(0);
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("shared category corrections are reused by another member", async ({ browser }, info) => {
  const a = await createLocalAccount("category-group-a"), b = await createLocalAccount("category-group-b");
  const owner = await onboard(a, "Category Alice"), peer = await onboard(b, "Category Bea");
  const invitation = await owner.group.command({ action: "invite", grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: crypto.randomUUID() });
  const review = await peer.group.command({ action: "inspect-pin", pin: invitation.pin! });
  await peer.group.command({ action: "join", grocerySharingAcknowledgment: "all-weeks-v1", pin: invitation.pin!, groupRevision: review.group!.revision, idempotencyKey: crypto.randomUUID() });
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, a), page = await context.newPage();
  const otherContext = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, b), otherPage = await otherContext.newPage();
  try {
    await page.setViewportSize({ width: info.project.name === "mobile" ? 412 : 1440, height: 930 });
    await page.goto("/grocery");
    const name = page.getByRole("combobox", { name: "Extra grocery item", exact: true });
    await checkAddAlignment(page, true, info.project.name === "mobile");
    let lostResponse = false;
    let releaseAdd!: () => void;
    const addPending = new Promise<void>(resolve => { releaseAdd = resolve; });
    await page.route("**/rest/v1/rpc/mutate_cooking_group_week", async route => {
      await addPending;
      const response = await route.fetch();
      if (!lostResponse && response.ok() && route.request().postDataJSON().p_payload.operation === "add") { lostResponse = true; await route.abort(); }
      else await route.fulfill({ response });
    });
    await name.fill("cocount milk");
    await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveValue("Pantry");
    await page.getByRole("textbox", { name: "Extra item quantity", exact: true }).fill("1.5");
    await page.getByRole("combobox", { name: "Extra item unit", exact: true }).selectOption("l");
    await page.getByRole("button", { name: "Add extra item", exact: true }).click();
    const add = page.getByRole("button", { name: "Add extra item", exact: true });
    try {
      await expect(add).toBeDisabled();
      await expect(add).toHaveAttribute("aria-busy", "true");
      await expect(add.locator(".lucide-loader-circle")).toBeVisible();
      await expect(add.locator(".lucide-plus")).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(add.locator(".lucide-loader-circle")).toHaveCSS("animation-name", "none");
    } finally { releaseAdd(); }
    await expect(page.getByRole("listitem", { name: "Cocount milk", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Add extra item", exact: true })).toBeEnabled();
    await expect(add).toHaveAttribute("aria-busy", "false");
    await expect(add.locator(".lucide-plus")).toBeVisible();
    await page.getByRole("button", { name: "Add extra item", exact: true }).click();
    await expect(page.getByText("1.5 L Cocount milk added to Pantry.", { exact: true })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Cocount milk", exact: true })).toHaveCount(1);
    await page.unroute("**/rest/v1/rpc/mutate_cooking_group_week");
    const row = page.getByRole("listitem", { name: "Cocount milk", exact: true });
    await expect(row.getByText("Added by Category Alice", { exact: true })).toBeVisible();
    await expect(row.getByText("adjusted by you", { exact: true })).toHaveCount(0);
    await row.getByRole("button", { name: "Edit quantity for Cocount milk", exact: true }).click();
    await row.getByRole("combobox", { name: "Category", exact: true }).selectOption("Other");
    const enlarged = await page.addStyleTag({ content: "html { font-size: 200% !important }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await enlarged.evaluate(element => (element as HTMLStyleElement).remove());
    await row.getByRole("button", { name: "Save quantity for Cocount milk", exact: true }).click();
    await expect(page.getByText("1.5 L Cocount milk moved to Other.", { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Edit quantity for Cocount milk", exact: true })).toBeFocused();
    await otherPage.goto("/grocery");
    await otherPage.getByRole("combobox", { name: "Extra grocery item", exact: true }).fill("cocount milk");
    await expect(otherPage.getByRole("combobox", { name: "Category", exact: true })).toHaveValue("Other");
    await expect(otherPage.getByText("Using the group’s saved category", { exact: true })).toBeVisible();
    const peerRow = otherPage.getByRole("listitem", { name: "Cocount milk", exact: true });
    await expect(peerRow.getByText("Added by Category Alice", { exact: true })).toBeVisible();
    await peerRow.getByRole("button", { name: "Edit quantity for Cocount milk", exact: true }).click();
    await peerRow.getByRole("textbox", { name: "Quantity for Cocount milk", exact: true }).fill("2.5");
    await peerRow.getByRole("button", { name: "Save quantity for Cocount milk", exact: true }).click();
    await expect(peerRow.getByRole("textbox", { name: "Quantity for Cocount milk", exact: true })).toHaveCount(0);
    await expect(peerRow.getByText("Added by Category Alice", { exact: true })).toBeVisible();
  } finally { await context.close(); await otherContext.close(); await deleteLocalAccount(b); await deleteLocalAccount(a); }
});
