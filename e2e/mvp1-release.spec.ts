import { test, expect, type Browser, type BrowserContext, type Locator, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { addDays, formatCompactWeekRange, formatFullDate, fromKey, startOfWeek, todayKey } from "../src/utility/dates";
import type { Database } from "../src/types/database.generated";
import {
  createAuthenticatedContext,
  createLocalAccount,
  deleteLocalAccount,
  type LocalAccount,
} from "./local-account";

async function archiveRecipeFromCard(page: Page, card: Locator) {
  await card.getByRole("button", { name: /^Edit / }).click();
  await page.getByRole("dialog", { name: "Edit recipe", exact: true }).getByRole("button", { name: "Archive recipe", exact: true }).click();
  await page.getByRole("dialog", { name: "Archive recipe?", exact: true }).getByRole("button", { name: "Archive recipe", exact: true }).click();
}

const userAState = "playwright/.auth/user-a.json";
const userBState = "playwright/.auth/user-b.json";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test("unresolved planned rows show normal empty slots while valid meals remain usable", async ({ browser }, info) => {
  const account = await createLocalAccount(`empty-planned-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  try {
    await completeOnboarding(page, "Empty planned slots");
    let mutations = 0;
    page.on("request", request => { if (/\/rpc\/(edit_meal_plan|skip_planned_meal|log_planned_meal|save_nutrition_log)$/.test(request.url())) mutations += 1; });
    await page.route("**/rest/v1/rpc/get_nutrition_week", async route => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const raw = await response.json() as { plannedMeals: Database["public"]["Tables"]["planned_meals"]["Row"][] };
      const template = raw.plannedMeals.find(row => row.meal_row_id !== null);
      expect(template).toBeTruthy();
      const date = todayKey();
      // Alter only this read response; no unresolved fixtures are persisted.
      raw.plannedMeals = [
        ...raw.plannedMeals.filter(row => row.meal_date !== date),
        { ...template!, app_id: "unavailable-breakfast", meal_date: date, meal_slot: "breakfast", meal_row_id: null, food_row_id: null, label: "Hidden unavailable breakfast" },
        { ...template!, app_id: "valid-lunch", meal_date: date, meal_slot: "lunch", label: "Available planned lunch", skipped: false },
        { ...template!, app_id: "unavailable-lunch", meal_date: date, meal_slot: "lunch", meal_row_id: null, food_row_id: null, label: "Hidden unavailable lunch" },
        { ...template!, app_id: "valid-skipped-snack", meal_date: date, meal_slot: "snack", label: "Available skipped snack", skipped: true },
      ];
      await route.fulfill({ response, json: raw });
    });
    await openNutritionPage(page);
    const planned = page.getByRole("region", { name: "Planned", exact: true });
    const breakfast = planned.getByRole("region", { name: "Breakfast", exact: true });
    const lunch = planned.getByRole("region", { name: "Lunch", exact: true });
    const snack = planned.getByRole("region", { name: "Snack", exact: true });
    await expect(planned.getByText("Unresolved meal", { exact: true })).toHaveCount(0);
    await expect(planned.getByText(/Hidden unavailable/)).toHaveCount(0);
    await expect(breakfast.getByText("Nothing planned or logged.", { exact: true })).toBeVisible();
    await expect(breakfast.getByRole("listitem")).toHaveCount(0);
    await expect(lunch.getByRole("listitem")).toHaveCount(1);
    await expect(lunch.getByRole("button", { name: "Log", exact: true })).toBeEnabled();
    await expect(lunch.getByText("Nothing planned or logged.", { exact: true })).toHaveCount(0);
    await expect(snack.getByRole("button", { name: "Plan again", exact: true })).toBeEnabled();
    const add = breakfast.getByRole("button", { name: "Add meal", exact: true });
    await add.focus(); await add.press("Enter");
    await expect(breakfast.getByRole("group", { name: "Add meal", exact: true })).toBeVisible();
    await breakfast.getByRole("button", { name: "Close", exact: true }).click();
    await expect(add).toBeFocused();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const largeText = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await largeText.evaluate(element => element.parentNode?.removeChild(element));
    await planned.screenshot({ path: `output/empty-planned/slots-${info.project.name}.png` });
    expect(mutations).toBe(0);
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("calendar preference and selected-day planning preserve dates across the app", async ({ browser }, info) => {
  const account = await createLocalAccount(`calendar-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  try {
    await page.goto("/onboarding");
    await page.getByLabel("What should we call you?").fill("Calendar Test");
    await page.getByLabel("Age").fill("30");
    await page.getByText("None of the situations below apply to me", { exact: true }).click();
    await page.getByLabel("Height (cm)").fill("168");
    await page.getByLabel("Weight (kg)").fill("68");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByLabel("Start of week", { exact: true })).toHaveValue("0");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByText("Maintain weight", { exact: true }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: "Create my plan", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${new URL(baseURL).origin}/?$`));
    await page.goto("/settings");
    await page.getByLabel("Start of week", { exact: true }).selectOption("6");
    await page.getByRole("button", { name: "Save start of week", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Weeks regrouped" })).toBeVisible();
    for (const route of ["/", "/workouts", "/progress", "/grocery"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await openNutritionPage(page);
    const days = page.getByRole("group", { name: "Choose a day", exact: true });
    await expect(days.getByRole("button").first()).toHaveAccessibleName(/^Saturday,/);
    await expect(days.locator('button[aria-pressed="true"]')).toHaveCSS("border-top-style", "solid");
    for (const day of await days.locator('button[aria-pressed="false"]').all()) {
      await expect(day).toHaveCSS("border-top-style", "solid");
      await expect(day).toHaveClass(/border-white/);
      await expect(day).toHaveCSS("border-top-width", "1px");
    }
    await days.screenshot({ path: `output/calendar/nutrition-day-strip-${info.project.name}.png` });
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    // A preserved onboarding week can spill into the next Saturday-based week.
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await page.getByRole("button", { name: "Generate", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Generate plan", exact: true });
    const dayChoices = dialog.getByRole("group", { name: "Choose days", exact: true });
    const selectedDate = addDays(startOfWeek(todayKey(), 6), 14);
    await expect(dialog.getByText(formatCompactWeekRange(selectedDate), { exact: true })).toHaveCount(0);
    await expect(dayChoices.getByRole("checkbox")).toHaveCount(7);
    if (info.project.name === "desktop") {
      await expect(dialog).toHaveCSS("transform", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
      for (const width of [320, 390, 596, 767, 768, 1440]) {
        await page.setViewportSize({ width, height: 930 });
        for (const groupName of ["Choose days", "Choose recipes"]) {
          const group = dialog.getByRole("group", { name: groupName, exact: true });
          for (const name of ["Select all", "Clear"]) {
            const action = group.getByRole("button", { name, exact: true });
            await expect(action).toHaveAccessibleName(name);
            await expect.poll(async () => (await action.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
            const bounds = (await action.boundingBox())!;
            expect(bounds.width).toBeGreaterThanOrEqual(44);
            expect(bounds.height).toBeGreaterThanOrEqual(44);
            await expect(action.locator("span")).toHaveCSS("position", width < 768 ? "absolute" : "static");
            if (width < 768) expect(bounds.width).toBe(44);
          }
        }
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        if (width === 596 || width === 768) await dialog.screenshot({ path: `output/generation-controls/dialog-${width}.png` });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    const dateLabels = await dayChoices.getByRole("checkbox").evaluateAll(elements => elements.map(element => element.getAttribute("aria-label")));
    await expect(dayChoices.getByRole("checkbox").first()).toHaveAccessibleName(/^Saturday,/);
    await dayChoices.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(dayChoices.locator('input:checked')).toHaveCount(0);
    for (const tile of await dayChoices.locator("label").all()) {
      await expect(tile).toHaveCSS("border-top-style", "dashed");
      await expect(tile).toHaveCSS("border-top-width", "1px");
    }
    expect(await dayChoices.getByRole("checkbox").evaluateAll(elements => elements.map(element => element.getAttribute("aria-label")))).toEqual(dateLabels);
    await expect(dialog.getByRole("button", { name: "Save plan", exact: true })).toBeDisabled();
    await expect(dialog.getByText("Choose at least one day to preview meals.", { exact: true })).toBeVisible();
    await dayChoices.getByRole("button", { name: "Select all", exact: true }).click();
    await expect(dayChoices.locator('input:checked')).toHaveCount(7);
    for (const tile of await dayChoices.locator("label").all()) await expect(tile).toHaveCSS("border-top-style", "solid");
    await dayChoices.getByRole("button", { name: "Clear", exact: true }).click();
    await dayChoices.getByRole("checkbox").first().check();
    await dayChoices.getByRole("checkbox").first().focus();
    await dayChoices.getByRole("checkbox").first().press("Space");
    await expect(dayChoices.getByRole("checkbox").first()).not.toBeChecked();
    await dayChoices.getByRole("checkbox").first().press("Space");
    await expect(dayChoices.getByRole("checkbox").first()).toBeFocused();
    await expect(dayChoices.locator("label").first()).toHaveCSS("outline-style", "solid");
    await expect(dayChoices.locator("label").first()).toHaveCSS("outline-width", "2px");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const largeText = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await largeText.evaluate(element => element.parentNode?.removeChild(element));
    await dayChoices.screenshot({ path: `output/calendar/day-choices-${info.project.name}.png` });
    const preview = dialog.getByRole("region", { name: "Generated plan preview", exact: true });
    await expect(preview.getByRole("listitem").first()).toContainText(formatFullDate(selectedDate));
    for (const row of await preview.getByRole("listitem").all()) {
      await expect(row).toContainText(formatFullDate(selectedDate));
      await expect(row).toContainText(/(?:Breakfast|Lunch|Dinner|Snack) · 1 serving/);
      await expect(row).toHaveClass(/bg-lav-50/);
      await expect(row.getByRole("button")).toHaveCount(0);
      await expect(row.getByText(/kcal|protein|trusted-catalog/)).toHaveCount(0);
    }
    const previewCount = await preview.getByRole("listitem").count();
    await expect(preview.getByRole("heading")).toHaveText(`Preview · ${previewCount} ${previewCount === 1 ? "meal" : "meals"}`);
    if (info.project.name === "desktop") {
      await page.setViewportSize({ width: 760, height: 930 });
      const headingBox = await dayChoices.getByRole("heading", { name: "Choose days", exact: true }).boundingBox();
      const selectBox = await dayChoices.getByRole("button", { name: "Select all", exact: true }).boundingBox();
      expect(Math.abs((headingBox!.y + headingBox!.height / 2) - (selectBox!.y + selectBox!.height / 2))).toBeLessThan(2);
      await dialog.screenshot({ path: "output/calendar/generation-760.png" });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await dialog.getByRole("button", { name: "Shuffle", exact: true }).click();
    await expect(dayChoices.getByRole("checkbox").first()).toBeChecked();
    await expect(dayChoices.locator('input:checked')).toHaveCount(1);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("button", { name: "Generate", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(dialog.getByRole("status").filter({ hasText: "Weekly plan draft restored" })).toBeVisible();
    await expect(dayChoices.getByRole("checkbox").first()).toBeChecked();
    await expect(dayChoices.locator('input:checked')).toHaveCount(1);
    await dialog.getByLabel(/^I reviewed the assignments/, {}).check();
    await dayChoices.getByRole("checkbox").nth(2).check();
    await expect(dialog.getByLabel(/^I reviewed the assignments/, {})).not.toBeChecked();
    await dayChoices.getByRole("checkbox").nth(2).uncheck();
    await dialog.getByLabel(/^I reviewed the assignments/, {}).check();
    await preview.screenshot({ path: `output/calendar/preview-rows-${info.project.name}.png` });
    await dialog.screenshot({ path: `output/calendar/generation-${info.project.name}.png` });
    let releaseSave: () => void = () => {};
    const blockedSave = new Promise<void>(resolve => { releaseSave = resolve; });
    await page.route("**/rest/v1/rpc/generate_nutrition_week", async route => {
      await blockedSave;
      await route.abort("failed");
    }, { times: 1 });
    await dialog.getByRole("button", { name: "Save plan", exact: true }).click();
    try {
      await expect(dialog.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
      for (const checkbox of await dayChoices.getByRole("checkbox").all()) await expect(checkbox).toBeDisabled();
      await expect(dayChoices.getByRole("button", { name: "Select all", exact: true })).toBeDisabled();
      await expect(dayChoices.getByRole("button", { name: "Clear", exact: true })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeDisabled();
    } finally { releaseSave(); }
    await expect(dialog.getByRole("status").filter({ hasText: "The save was not confirmed" })).toBeVisible();
    await expect(dayChoices.locator('input:checked')).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Save plan", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Save plan", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await days.getByRole("button").first().click();
    await expect(page.getByRole("button", { name: "Log", exact: true }).first()).toBeVisible();
    await days.getByRole("button").nth(1).click();
    await expect(days.locator('button[aria-pressed="true"]')).toHaveCount(1);
    await expect(days.getByRole("button").nth(1)).toHaveAttribute("aria-pressed", "true");
    await page.goto("/settings");
    await expect(page.getByLabel("Start of week", { exact: true })).toHaveValue("6");
    await page.route("**/rest/v1/rpc/set_week_start", route => route.abort("failed"));
    await page.getByLabel("Start of week", { exact: true }).selectOption("2");
    await page.getByRole("button", { name: "Save start of week", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Your selection is retained" })).toBeVisible();
    await expect(page.getByLabel("Start of week", { exact: true })).toHaveValue("2");
    await page.unroute("**/rest/v1/rpc/set_week_start");
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("weekly grocery spending recovers drafts, retries safely, and follows responsive controls", async ({ browser }, info) => {
  const account = await createLocalAccount(`grocery-spending-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  try {
    await completeOnboarding(page, "Grocery Spending"); await page.goto("/grocery");
    const next = page.getByRole("button", { name: "Next grocery week", exact: true });
    const previous = page.getByRole("button", { name: "Previous grocery week", exact: true });
    await next.click(); await next.click();
    const spending = page.getByRole("region", { name: "Weekly grocery spending", exact: true });
    const edit = spending.getByRole("button", { name: "Edit total amount", exact: true });
    const amount = spending.getByRole("textbox", { name: "Total amount (PHP)", exact: true });
    const save = spending.getByRole("button", { name: "Save amount", exact: true });
    await expect(spending.getByText("Not recorded", { exact: true })).toBeVisible();
    await edit.press("Enter"); await expect(amount).toBeFocused();
    await amount.fill("-1"); await expect(save).toBeDisabled();
    await amount.fill("1.234"); await expect(save).toBeDisabled();
    await amount.fill("1250.50");
    await next.click(); await expect(spending.getByText("₱—", { exact: true })).toBeVisible();
    await previous.click(); await expect(amount).toHaveValue("1250.50");
    await page.reload(); await next.click(); await next.click(); await expect(amount).toHaveValue("1250.50");
    await context.setOffline(true); await save.click();
    await expect(amount).toHaveValue("1250.50");
    const retryWeek = page.getByRole("button", { name: "Retry grocery week", exact: true });
    await expect(retryWeek).toBeVisible(); await context.setOffline(false); await retryWeek.click();
    await expect(spending.getByRole("button", { name: "Retry save", exact: true })).toBeEnabled();
    let firstKey = "";
    await page.route("**/rest/v1/rpc/set_grocery_total_amount", route => {
      firstKey = route.request().postDataJSON().p_payload.idempotencyKey;
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary spending save failure" }) });
    });
    await spending.getByRole("button", { name: "Retry save", exact: true }).click();
    await expect(amount).toHaveValue("1250.50"); await expect(spending.getByText("₱—", { exact: true })).toBeVisible();
    await page.unroute("**/rest/v1/rpc/set_grocery_total_amount");
    const confirmed = nextRpcResponse(page, "set_grocery_total_amount"); await spending.getByRole("button", { name: "Retry save", exact: true }).click();
    const response = await confirmed; expect(response.ok(), await response.text()).toBe(true);
    expect(response.request().postDataJSON().p_payload.idempotencyKey).toBe(firstKey);
    await expect(spending.getByText("₱1,250.50", { exact: true })).toBeVisible();
    await expect(amount).toHaveCount(0); await expect(edit).toBeFocused();
    await next.click(); await edit.click(); await amount.fill("0");
    const zero = nextRpcResponse(page, "set_grocery_total_amount"); await save.click(); expect((await zero).ok()).toBe(true);
    await expect(spending.getByText("₱0.00", { exact: true })).toBeVisible();
    await previous.click(); await expect(spending.getByText("₱1,250.50", { exact: true })).toBeVisible();
    const item = page.getByRole("textbox", { name: "Extra grocery item name", exact: true });
    await item.fill("Weekly spending extra");
    const added = nextRpcResponse(page, "add_custom_grocery_item"); await page.getByRole("button", { name: "Add custom grocery item", exact: true }).click(); expect((await added).ok()).toBe(true);
    const refresh = nextRpcResponse(page, "regenerate_grocery"); await page.getByRole("button", { name: "Refresh", exact: true }).click(); expect((await refresh).ok()).toBe(true);
    await expect(spending.getByText("₱1,250.50", { exact: true })).toBeVisible();
    await edit.click(); await amount.fill("2500.75");
    await page.route("**/rest/v1/rpc/set_grocery_total_amount", route => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "stale_version: changed elsewhere", details: JSON.stringify({ code: "stale_version", entity: "grocery" }) }) }));
    await save.click();
    const reviewLatest = spending.getByRole("button", { name: "Review latest amount", exact: true });
    await expect(reviewLatest).toBeVisible(); await expect(save).toBeDisabled(); await expect(amount).toHaveValue("2500.75");
    await page.unroute("**/rest/v1/rpc/set_grocery_total_amount");
    await reviewLatest.click(); await expect(save).toBeEnabled(); await expect(save).toBeFocused();
    for (const width of [320, 390, 565, 595, 767, 768, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      const nameBox = await item.boundingBox(); const quantityBox = await page.getByRole("textbox", { name: "Quantity", exact: true }).boundingBox();
      expect(nameBox && quantityBox).toBeTruthy();
      if (width < 768) expect(quantityBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
      else expect(Math.abs(quantityBox!.y - nameBox!.y)).toBeLessThan(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      expect(await page.getByRole("button", { name: "Add custom grocery item", exact: true }).evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      if ([320, 595, 768].includes(width)) { await spending.scrollIntoViewIfNeeded(); await page.screenshot({ path: `output/grocery-amount/width-${width}-${info.project.name}.png` }); }
    }
    await page.setViewportSize({ width: info.project.name === "mobile" ? 320 : 973, height: 930 });
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    await page.screenshot({ path: `output/grocery-amount/large-text-${info.project.name}.png` });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await amount.press("Escape"); await expect(edit).toBeFocused();
    await page.reload(); await next.click(); await next.click(); await expect(amount).toHaveCount(0); await expect(spending.getByText("₱1,250.50", { exact: true })).toBeVisible();
    await page.screenshot({ path: `output/grocery-amount/complete-${info.project.name}.png` });
    await edit.click(); await amount.fill(""); const cleared = nextRpcResponse(page, "set_grocery_total_amount"); await save.click(); expect((await cleared).ok()).toBe(true);
    await expect(spending.getByText("Not recorded", { exact: true })).toBeVisible();
  } finally { await context.setOffline(false); await context.close(); await deleteLocalAccount(account); }
});

test("approved shared recipes show bundled covers and authored ingredients for new accounts", async ({ browser }, info) => {
  const account = await createLocalAccount(`shared-defaults-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  try {
    await completeOnboarding(page, "Shared Recipes"); await openNutritionPage(page);
    const recipes = page.getByRole("region", { name: "Recipes", exact: true });
    for (const [name, slug, ingredient] of [
      ["Hainanese Chicken Rice", "hainanese-chicken-rice", "Water"],
      ["Korean Broccoli Side Dish", "korean-broccoli-side-dish", "Broccoli"],
      ["Tortang Talong with Chicken", "tortang-talong-with-chicken", "Egg"],
    ]) {
      await recipes.getByRole("button", { name: `View recipe: ${name}`, exact: true }).click();
      const overview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
      const cover = overview.getByRole("img", { name: `Cover for ${name}`, exact: true });
      await expect(cover).toHaveAttribute("src", `/images/recipes/${slug}.webp`);
      await expect.poll(() => cover.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
      await overview.getByRole("tab", { name: "Ingredients", exact: true }).click();
      await expect(overview.getByRole("tabpanel", { name: "Ingredients", exact: true })).toContainText(ingredient);
      await overview.getByRole("button", { name: "Close", exact: true }).click();
    }
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("grocery quantity edits require save and preserve recoverable revisions", async ({ browser }, info) => {
  const account = await createLocalAccount(`grocery-quantity-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  try {
    await completeOnboarding(page, "Quantity Editing"); await page.goto("/grocery");
    const next = page.getByRole("button", { name: "Next grocery week", exact: true });
    await next.click(); await next.click();
    const name = "Quantity test with a long ingredient name that wraps safely";
    await page.getByRole("textbox", { name: "Extra grocery item name", exact: true }).fill(name);
    const added = nextRpcResponse(page, "add_custom_grocery_item"); await page.getByRole("button", { name: "Add custom grocery item", exact: true }).click(); expect((await added).ok()).toBe(true);
    const row = page.getByRole("listitem", { name, exact: true });
    const edit = row.getByRole("button", { name: `Edit quantity for ${name}`, exact: true });
    const field = row.getByRole("textbox", { name: `Quantity for ${name}`, exact: true });
    const save = row.getByRole("button", { name: `Save quantity for ${name}`, exact: true });
    const cancel = row.getByRole("button", { name: `Cancel quantity edit for ${name}`, exact: true });
    await expect(row.getByRole("button", { name: `Increase ${name}`, exact: true })).toHaveCount(0);
    await edit.press("Enter"); await expect(field).toBeFocused();
    await field.fill("2.5"); await row.getByRole("button", { name: `Increase ${name}`, exact: true }).click(); await expect(field).toHaveValue("3.5");
    await row.getByRole("button", { name: `Decrease ${name}`, exact: true }).click(); await expect(field).toHaveValue("2.5");
    await next.click(); await page.getByRole("button", { name: "Previous grocery week", exact: true }).click(); await expect(field).toHaveValue("2.5");
    await page.reload(); await next.click(); await next.click(); await expect(field).toHaveValue("2.5");
    for (const bad of ["", "-1", "1000001", "no"]) { await field.fill(bad); await expect(save).toBeDisabled(); }
    await field.fill("2.5");
    for (const width of [320,390,430,668,767,768,1440]) {
      await page.setViewportSize({width,height:930});
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
      for (const button of await row.getByRole("button").all()) { const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44); }
      const nameBox = await row.locator("p").first().boundingBox(); const fieldBox = await field.boundingBox();
      if (width < 768) expect(fieldBox!.y).toBeGreaterThanOrEqual(nameBox!.y+nameBox!.height);
      else expect(fieldBox!.y).toBeLessThan(nameBox!.y+nameBox!.height);
      if (width === 320) { const cancelBox=await cancel.boundingBox(); expect(cancelBox!.y).toBeGreaterThan(fieldBox!.y); }
      if ([320,430,768].includes(width)) { await row.scrollIntoViewIfNeeded(); await page.screenshot({path:`output/grocery-amount/quantity-${width}-${info.project.name}.png`}); }
    }
    await page.setViewportSize({width:430,height:930});
    const toolbar = page.getByRole("group",{name:"Choose a grocery week",exact:true}).locator('[data-wrapped]');
    await expect(toolbar).toHaveAttribute("data-wrapped","true");
    const navBox = await toolbar.locator(":scope > div").boundingBox(); const rangeBox = await toolbar.locator(":scope > p").boundingBox();
    expect(Math.abs(navBox!.x+navBox!.width/2-rangeBox!.x-rangeBox!.width/2)).toBeLessThan(2);
    let retryKey="";
    await page.route("**/rest/v1/rpc/set_grocery_quantity", route => { retryKey=route.request().postDataJSON().p_payload.idempotencyKey; return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Temporary quantity failure"})}); });
    await save.click(); await expect(row.getByRole("alert")).toBeVisible(); await expect(field).toHaveValue("2.5");
    await page.unroute("**/rest/v1/rpc/set_grocery_quantity");
    const saved=nextRpcResponse(page,"set_grocery_quantity"); await row.getByRole("button",{name:`Retry saving ${name}`,exact:true}).click();
    const response=await saved; expect(response.ok(),await response.text()).toBe(true); expect(response.request().postDataJSON().p_payload.idempotencyKey).toBe(retryKey);
    await expect(field).toHaveCount(0); await expect(edit).toBeFocused(); await expect(row).toContainText("2.5");
    await edit.click(); await field.fill("0"); const zero=nextRpcResponse(page,"set_grocery_quantity"); await field.press("Enter"); expect((await zero).ok()).toBe(true); await expect(field).toHaveCount(0);
    await edit.click(); await field.fill("9"); await field.press("Escape"); await expect(edit).toBeFocused(); await edit.click(); await expect(field).toHaveValue("0");
    await field.fill("5.5");
    await page.route("**/rest/v1/rpc/set_grocery_quantity",route=>route.fulfill({status:400,contentType:"application/json",body:JSON.stringify({message:"stale_version: changed elsewhere",details:JSON.stringify({code:"stale_version",entity:"grocery"})})}));
    await save.click(); await expect(row.getByRole("button",{name:"Review latest quantity",exact:true})).toBeVisible(); await expect(save).toBeDisabled(); await expect(field).toHaveValue("5.5");
    await page.unroute("**/rest/v1/rpc/set_grocery_quantity"); await row.getByRole("button",{name:"Review latest quantity",exact:true}).click(); await expect(save).toBeFocused(); await expect(save).toBeEnabled();
    await page.emulateMedia({reducedMotion:"reduce"}); await page.setViewportSize({width:320,height:930}); await page.evaluate(()=>{document.documentElement.style.fontSize="200%";});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    await page.evaluate(()=>{document.documentElement.style.fontSize="";}); await cancel.click();
    await page.route("**/rest/v1/rpc/remove_grocery_item",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Temporary delete failure"})}));
    await row.getByRole("button",{name:`Remove ${name}`,exact:true}).click(); await expect(row).toBeVisible(); await expect(row.getByRole("alert")).toBeVisible();
    await page.unroute("**/rest/v1/rpc/remove_grocery_item"); const removed=nextRpcResponse(page,"remove_grocery_item"); await row.getByRole("button",{name:`Remove ${name}`,exact:true}).click(); expect((await removed).ok()).toBe(true); await expect(row).toHaveCount(0);
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("grocery weeks audit generated recipe quantities and preserve isolated edits and drafts", async ({ browser }, info) => {
  const account = await createLocalAccount(`grocery-weeks-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  try {
    await completeOnboarding(page, "Grocery Weeks"); await openNutritionPage(page);
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "Next week", exact: true }).click();
      await page.getByRole("button", { name: "Generate", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Generate plan", exact: true });
      const recipes = dialog.getByRole("group", { name: "Choose recipes", exact: true });
      await recipes.getByRole("button", { name: "Clear", exact: true }).click();
      for (const name of ["Creamy Lemon Chicken", "Korean Beef Bowl", "Sticky Teriyaki Chicken", "Chicken Burrito Protein Boxes"]) {
        await dialog.getByRole("list", { name: "Recipe choices" }).getByText(name, { exact: true }).click();
      }
      await expect(dialog.getByText("Preview · 14 meals", { exact: true })).toBeVisible();
      const saved = nextRpcResponse(page, "generate_nutrition_week");
      await dialog.getByRole("button", { name: "Save plan", exact: true }).click();
      expect((await saved).ok()).toBe(true); await expect(dialog).not.toBeVisible();
    }
    await page.goto("/grocery");
    await expect(page.getByRole("heading", { name: "Grocery list", exact: true })).toBeVisible();
    const weekOf = addDays(startOfWeek(todayKey()), 7);
    const navigator = page.getByRole("group", { name: "Choose a grocery week", exact: true });
    await expect(page.getByLabel("Jump to grocery week", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Next grocery week", exact: true }).click();
    await expect(navigator).toContainText(formatFullDate(weekOf));
    const chicken = () => page.getByRole("listitem").filter({ has: page.getByText("Chicken breast, skinless, boneless", { exact: true }) });
    await expect(chicken()).toContainText("generated 1200 g");
    await expect(page.getByRole("listitem").filter({ has: page.getByText("Jasmine rice (uncooked; long-grain rice proxy)", { exact: true }) })).toContainText("generated 500 g");
    const toggled = nextRpcResponse(page, "toggle_grocery_item");
    await chicken().getByRole("checkbox").click(); expect((await toggled).ok()).toBe(true);
    await expect(chicken().getByRole("checkbox")).toBeChecked();
    await chicken().getByRole("button", { name: "Edit quantity for Chicken breast, skinless, boneless", exact: true }).click();
    await chicken().getByRole("button", { name: "Decrease Chicken breast, skinless, boneless", exact: true }).click();
    const changed = nextRpcResponse(page, "set_grocery_quantity");
    await chicken().getByRole("button", { name: "Save quantity for Chicken breast, skinless, boneless", exact: true }).click(); expect((await changed).ok()).toBe(true);
    await expect(chicken()).toContainText("1199");
    const extra = page.getByRole("textbox", { name: "Extra grocery item name", exact: true });
    await extra.fill("Only first week draft");
    await page.getByRole("button", { name: "Next grocery week", exact: true }).click();
    await expect(navigator).toContainText(formatFullDate(addDays(weekOf, 7)));
    await expect(chicken()).toContainText("generated 1200 g"); await expect(chicken().getByRole("checkbox")).not.toBeChecked();
    await expect(extra).toHaveValue(""); await expect(chicken()).not.toContainText("1199");
    await page.getByRole("button", { name: "Previous grocery week", exact: true }).click();
    await expect(extra).toHaveValue("Only first week draft"); await expect(chicken().getByRole("checkbox")).toBeChecked();
    const regenerated = nextRpcResponse(page, "regenerate_grocery"); await page.getByRole("button", { name: "Refresh", exact: true }).click(); expect((await regenerated).ok()).toBe(true);
    await expect(chicken()).toContainText("1199"); await expect(chicken()).toContainText("generated 1200 g");
    await expect(chicken().getByRole("checkbox")).toBeChecked();
    if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const physicalWidth = page.viewportSize()!.width;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(physicalWidth + 1);
    expect(await chicken().locator("p").first().evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(120);
    expect(await chicken().getByRole("button", { name: "Edit quantity for Chicken breast, skinless, boneless", exact: true }).evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(44);
    await navigator.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/grocery-weeks/grocery-${info.project.name}.png`, fullPage: false });
    await chicken().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `output/grocery-weeks/grocery-items-${info.project.name}.png`, fullPage: false });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.route("**/rest/v1/rpc/get_nutrition_week", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Test read failure" }) }));
    await page.getByRole("button", { name: "Next grocery week", exact: true }).click();
    await page.getByRole("button", { name: "Next grocery week", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry grocery week", exact: true })).toBeVisible();
    await expect(page.getByText("No groceries for this week", { exact: true })).not.toBeVisible();
    await page.unroute("**/rest/v1/rpc/get_nutrition_week");
    await page.getByRole("button", { name: "Retry grocery week", exact: true }).click();
    await expect(page.getByText("No groceries for this week", { exact: true })).toBeVisible();
    await extra.fill("Empty week extra"); const added = nextRpcResponse(page, "add_custom_grocery_item");
    await page.getByRole("button", { name: "Add custom grocery item", exact: true }).click(); expect((await added).ok()).toBe(true);
    await expect(page.getByRole("listitem").filter({ hasText: "Empty week extra" })).toBeVisible();
    await page.getByRole("button", { name: "This week", exact: true }).click();
    await expect(navigator).toContainText(formatFullDate(startOfWeek(todayKey()))); await expect(page.getByText("Empty week extra", { exact: true })).not.toBeVisible();
  } finally { await context.close(); await deleteLocalAccount(account); }
});

async function fillRecipeSection(editor: Locator, section: "Details" | "Instructions", label: string, value: string) {
  await editor.getByRole("tab", { name: section, exact: true }).click();
  await editor.getByLabel(label).fill(value);
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
}

async function openRecipe(page: Page, configureDefaults = true) {
  await openNutritionPage(page);
  await clearBrowserDrafts(page);
  await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create recipe", exact: true });
  if (configureDefaults) {
    await editor.getByLabel("Complexity (required)", { exact: true }).selectOption("easy");
    await editor.getByRole("checkbox", { name: "Breakfast", exact: true }).check();
  }
  return editor;
}

test("reviewed chicken catalog preserves cooking units, estimates, covers and personal edits", async ({ browser }, info) => {
  const account = await createLocalAccount(`chicken-catalog-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  try {
    await completeOnboarding(page, "Chicken Catalog"); await openNutritionPage(page);
    const recipes = page.getByRole("region", { name: "Recipes", exact: true });
    const cases = [
      { name: "Sticky Teriyaki Chicken", asset: "sticky-teriyaki-chicken", calories: "≈449 kcal", time: "30 mins", slots: "Lunch, Dinner", comparison: "520 kcal, 48 g protein", amounts: ["80 ml", "250 g"], garnish: "Sesame seeds" },
      { name: "Chicken Burrito Protein Boxes", asset: "chicken-burrito-protein-boxes", calories: "≈327 kcal", time: "20 mins", slots: "Breakfast, Lunch", comparison: "480 kcal, 50 g protein", amounts: ["1 tin (240 g drained)", "1 tin (285 g drained)", "½ red onion"], garnish: "Fresh coriander" },
    ];
    const overview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
    for (const recipe of cases) {
      await recipes.getByRole("button", { name: `View recipe: ${recipe.name}`, exact: true }).click();
      await expect(overview.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(overview.getByText(recipe.calories, { exact: true })).toBeVisible();
      await expect(overview.getByText(recipe.time, { exact: true })).toBeVisible();
      await expect(overview.getByText(`Use this recipe for: ${recipe.slots}`, { exact: true })).toBeVisible();
      await expect(overview.getByRole("img", { name: `Cover for ${recipe.name}`, exact: true })).toHaveAttribute("src", `/images/recipes/${recipe.asset}.png`);
      await expect(overview.getByText(recipe.comparison, { exact: false })).toBeVisible();
      await overview.getByRole("tab", { name: "Ingredients", exact: true }).click();
      for (const amount of recipe.amounts) await expect(overview.getByText(amount, { exact: true })).toBeVisible();
      await expect(overview.getByText(recipe.garnish, { exact: true })).toBeVisible();
      await expect(overview.getByRole("tabpanel", { name: "Ingredients", exact: true }).getByText("Per serving · estimates", { exact: true })).toHaveCount(0);
      await overview.getByRole("tab", { name: "Instructions", exact: true }).click();
      await expect(overview.getByText(/74°C \(165°F\)/)).toBeVisible();
      await expect(overview.getByRole("tabpanel", { name: "Instructions", exact: true }).getByText(recipe.comparison, { exact: false })).toHaveCount(0);
      if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      expect(await overview.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      await overview.getByRole("button", { name: "Close", exact: true }).click();
    }
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await page.getByRole("button", { name: "Generate", exact: true }).click();
    const generation = page.getByRole("dialog", { name: "Generate plan", exact: true });
    await generation.getByRole("group", { name: "Choose recipes", exact: true }).getByRole("button", { name: "Clear", exact: true }).click();
    for (const recipe of cases) await generation.getByRole("list", { name: "Recipe choices" }).getByText(recipe.name, { exact: true }).click();
    await expect(generation.getByRole("heading", { name: "Preview · 8 meals", exact: true })).toBeVisible();
    await generation.getByRole("button", { name: "Close", exact: true }).click();
    await recipes.getByRole("button", { name: "View recipe: Sticky Teriyaki Chicken", exact: true }).click();
    await overview.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit recipe", exact: true });
    const personalName = `Teriyaki personal ${info.project.name}`;
    await editor.getByLabel("Recipe name", { exact: true }).fill(personalName);
    const save = nextRpcResponse(page, "save_recipe"); await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    expect((await save).ok()).toBe(true);
    await expect(editor).not.toBeVisible();
    if (await overview.isVisible()) await overview.getByRole("button", { name: "Close", exact: true }).click();
    await recipes.getByRole("button", { name: `View recipe: ${personalName}`, exact: true }).click();
    await expect(overview.getByRole("img", { name: `Cover for ${personalName}`, exact: true })).toHaveAttribute("src", "/images/recipes/sticky-teriyaki-chicken.png");
    await expect(overview.getByText("≈449 kcal", { exact: true })).toBeVisible();
    await overview.screenshot({ path: `output/chicken-recipe-catalog/overview-${info.project.name}.png` });
    await overview.getByRole("button", { name: "Close", exact: true }).click();
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("recipe meal assignments generate a recoverable weekly preview without changing history", async ({ browser }, info) => {
  const account = await createLocalAccount(`weekly-generation-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  try {
    await completeOnboarding(page, "Weekly Generation");
    const editor = await openRecipe(page);
    const recipes = page.getByRole("region", { name: "Recipes", exact: true });
    await expect(recipes.getByRole("heading", { name: "Recipes", exact: true })).toHaveCount(1);
    await expect(recipes.getByRole("button", { name: "About Recipes", exact: true })).toHaveCount(1);
    await expect(recipes.getByRole("button", { name: "Create", exact: true })).toHaveClass(/bg-white\/70 text-ink/);
    await expect(recipes.getByRole("button", { name: "Create", exact: true }).locator('svg.lucide-plus[aria-hidden="true"]')).toHaveCount(1);
    const name = `Weekly Recipe ${info.project.name} with chicken, vegetables and rice`;
    await editor.getByLabel("Recipe name", { exact: true }).fill(name);
    await editor.getByLabel("Recipe servings", { exact: true }).fill("2.5");
    await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expect(editor.getByText("Enter a whole serving count from 1 to 10,000.")).toBeVisible();
    await editor.getByLabel("Recipe servings", { exact: true }).fill("4");
    await editor.getByRole("checkbox", { name: "Snack", exact: true }).check();
    await editor.getByRole("button", { name: "Change image", exact: true }).click();
    await expect(editor.getByRole("radiogroup", { name: "Recipe image presets" })).toHaveCount(0);
    for (const label of ["Upload image", "Use image URL", "Reset to default"]) await expect(editor.getByRole("button", { name: label, exact: true })).toBeVisible();
    await editor.getByRole("tab", { name: "Instructions", exact: true }).click();
    await editor.getByLabel("Instructions (required)").fill("Mix and serve.");
    await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
    await editor.getByLabel("Ingredient search").fill("Greek yogurt");
    await editor.getByRole("button", { name: /Greek yogurt.*170 g/ }).click();
    await editor.getByLabel("Greek yogurt quantity", { exact: true }).fill("400");
    await editor.getByRole("tab", { name: "Details", exact: true }).click();
    await editor.getByRole("checkbox", { name: "Breakfast", exact: true }).uncheck();
    await editor.getByRole("checkbox", { name: "Snack", exact: true }).uncheck();
    await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await editor.getByRole("checkbox", { name: "Breakfast", exact: true }).check();
    await editor.getByRole("checkbox", { name: "Snack", exact: true }).check();
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true }).click();
    await expect(editor.getByRole("checkbox", { name: "Breakfast", exact: true })).toBeChecked();
    await expect(editor.getByRole("checkbox", { name: "Snack", exact: true })).toBeChecked();
    const created = nextRpcResponse(page, "save_recipe"); await editor.getByRole("button", { name: "Save", exact: true }).click();
    expect((await created).ok()).toBe(true);
    const overview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
    await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: `View recipe: ${name}`, exact: true }).click();
    await expect(overview.getByText("Breakfast, Snack", { exact: false })).toBeVisible();
    await overview.getByRole("button", { name: "Edit", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit recipe", exact: true });
    await expect(edit.getByRole("checkbox", { name: "Snack", exact: true })).toBeChecked();
    await edit.getByRole("button", { name: "Cancel", exact: true }).click();
    if (await overview.isVisible()) await overview.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    const generate = page.getByRole("region", { name: "Planned", exact: true }).getByRole("button", { name: "Generate", exact: true });
    await page.route("**/images/recipes/korean-beef-bowl.png", route => route.abort());
    await expect(generate).toBeEnabled(); await generate.click();
    await expect(generate).toHaveClass(/bg-ink text-white/);
    await expect(generate.locator('svg.lucide-wand-sparkles[aria-hidden="true"]')).toHaveCount(1);
    const dialog = page.getByRole("dialog", { name: "Generate plan", exact: true });
    await expect(dialog.getByRole("button", { name: "Close generate plan", exact: true })).toBeVisible();
    const selectedWeek = startOfWeek(addDays(todayKey(), 7));
    await expect(dialog.getByText(formatCompactWeekRange(selectedWeek), { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(`${formatFullDate(selectedWeek)} – ${formatFullDate(addDays(selectedWeek, 6))}`, { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("group", { name: "Choose days", exact: true }).getByRole("checkbox").first()).toHaveAccessibleName(formatFullDate(selectedWeek));
    const explanation = "Fill this week’s empty meals with one serving per entry. Each recipe has one weekly batch; existing active planned servings count toward its yield.";
    await expect(dialog.getByText(explanation, { exact: true })).toHaveCount(0);
    const help = dialog.getByRole("button", { name: "About generate plan", exact: true });
    if (info.project.name === "desktop") { await help.hover(); await expect(help).toHaveAttribute("aria-expanded", "true"); }
    await help.click();
    const helpPanel = page.getByRole("dialog", { name: "Generate plan", exact: true }).filter({ has: page.getByRole("heading", { level: 3, name: "Generate plan", exact: true }) });
    await expect(helpPanel.getByText(explanation, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(help).toBeFocused(); await expect(helpPanel).toHaveCount(0);
    const choices = dialog.getByRole("list", { name: "Recipe choices" });
    await expect(choices.getByRole("checkbox", { name: "Korean Beef Bowl", exact: true }).locator("xpath=ancestor::label").locator("img")).toHaveAttribute("src", "/images/recipe-default.png");
    await page.unroute("**/images/recipes/korean-beef-bowl.png");
    const gridColumns = () => choices.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    expect(await gridColumns()).toBe(info.project.name === "mobile" ? 2 : 4);
    const recipeChoices = dialog.getByRole("group", { name: "Choose recipes", exact: true });
    const selectAll = recipeChoices.getByRole("button", { name: "Select all", exact: true });
    const clear = recipeChoices.getByRole("button", { name: "Clear", exact: true });
    await expect(selectAll).toHaveClass(/bg-ink text-white/);
    await expect(clear).not.toHaveClass(/bg-ink text-white/);
    for (const [control, label] of [[selectAll, "Select all"], [clear, "Clear"]] as const) {
      await expect(control).toHaveAccessibleName(label);
      const bounds = (await control.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44);
      if (info.project.name === "desktop") expect(await control.evaluate(node => {
        const icon = node.querySelector('svg[aria-hidden="true"]')!;
        const range = document.createRange(); range.selectNodeContents(node.lastChild!);
        return icon.getBoundingClientRect().right <= range.getBoundingClientRect().left;
      })).toBe(true);
      await control.focus();
      await expect(page.getByRole("tooltip", { name: label, exact: true })).toHaveCount(0);
      expect(await control.evaluate(node => getComputedStyle(node).outlineStyle)).toBe("solid");
      await expect(dialog).toBeVisible(); await expect(control).toBeFocused();
    }
    await selectAll.focus(); await page.keyboard.press("Tab"); await expect(clear).toBeFocused();
    if (info.project.name === "desktop") {
      await selectAll.hover(); await expect(page.getByRole("tooltip", { name: "Select all", exact: true })).toHaveCount(0);
    }
    const header = dialog.getByRole("heading", { name: "Choose recipes", exact: true });
    const headerBounds = (await header.boundingBox())!, selectBounds = (await selectAll.boundingBox())!, clearBounds = (await clear.boundingBox())!;
    expect(selectBounds.x).toBeGreaterThan(headerBounds.x + headerBounds.width);
    expect(clearBounds.x).toBeGreaterThan(selectBounds.x);
    expect(clearBounds.y).toBeCloseTo(selectBounds.y, 0);
    await selectAll.click();
    expect(await choices.locator('input:checked').count()).toBe(await choices.getByRole("checkbox").count());
    await clear.click();
    expect(await choices.locator('input:checked').count()).toBe(0);
    const choice = dialog.getByRole("checkbox", { name, exact: true });
    const recipeCard = choice.locator("xpath=ancestor::label");
    await expect(choice).toHaveCSS("position", "absolute");
    await expect(choice).toHaveCSS("width", "1px");
    await expect(choice).toHaveCSS("height", "1px");
    for (const target of [recipeCard.locator("img"), choices.getByText(name, { exact: true }), recipeCard.locator('[id$="-details"]')]) {
      await target.click();
      await expect(choice).toBeChecked();
      await expect(recipeCard).toHaveClass(/border-ink bg-lav-50/);
      await target.click();
      await expect(choice).not.toBeChecked();
      await expect(recipeCard).toHaveClass(/border-ink\/15 bg-white/);
    }
    await choices.getByText(name, { exact: true }).click();
    await expect(choice).toBeChecked();
    await choice.focus(); await page.keyboard.press("Space"); await expect(choice).not.toBeChecked();
    await page.keyboard.press("Space"); await expect(choice).toBeChecked();
    expect(await choice.locator("xpath=ancestor::label").evaluate(node => getComputedStyle(node).outlineStyle)).toBe("solid");
    const imageInset = await choice.locator("xpath=ancestor::label").locator("img").evaluate(image => {
      const well = image.parentElement!.parentElement!.getBoundingClientRect(), bounds = image.getBoundingClientRect();
      return [bounds.left - well.left, bounds.top - well.top, well.right - bounds.right, well.bottom - bounds.bottom];
    });
    for (const inset of imageInset) expect(inset).toBeCloseTo(15, 0);
    await expect(dialog.getByRole("heading", { name: "Preview · 4 meals", exact: true })).toBeVisible();
    const preview = dialog.getByRole("region", { name: "Generated plan preview" });
    const first = await preview.getByRole("listitem").allTextContents();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(generate).toBeFocused(); await generate.click();
    await expect(dialog.getByText("Weekly plan draft restored. Review the preview before saving.")).toBeVisible();
    expect(await preview.getByRole("listitem").allTextContents()).toEqual(first);
    await dialog.getByRole("button", { name: "Shuffle", exact: true }).click();
    await expect(preview.getByRole("listitem")).toHaveCount(4);
    if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
    expect(await gridColumns()).toBe(info.project.name === "mobile" ? 2 : 4);
    await choices.screenshot({ path: `output/weekly-generation/compact-cards-${info.project.name}.png` });
    await header.scrollIntoViewIfNeeded();
    await dialog.screenshot({ path: `output/nutrition-button-labels/generate-${info.project.name}.png` });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await dialog.locator('[data-modal-body]').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await gridColumns()).toBe(info.project.name === "mobile" ? 1 : 2);
    const enlargedActions = clear.locator("..").locator("..");
    expect(await enlargedActions.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await choices.evaluate(node => [node, ...node.querySelectorAll("*")].every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
    await dialog.screenshot({ path: `output/weekly-generation/dialog-${info.project.name}.png` });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    let firstKey = ""; let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/rest/v1/rpc/generate_nutrition_week", async route => {
      firstKey = route.request().postDataJSON().p_payload.idempotencyKey; await held;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary save failure" }) });
    });
    const failed = nextRpcResponse(page, "generate_nutrition_week"); await dialog.getByRole("button", { name: "Save plan", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Shuffle", exact: true })).toBeDisabled();
    await expect(choice).toBeDisabled();
    await expect(selectAll).toBeDisabled(); await expect(clear).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next week", exact: true })).toBeDisabled();
    release(); expect((await failed).ok()).toBe(false);
    await expect(dialog.getByText(/The save was not confirmed/)).toBeVisible();
    await page.unroute("**/rest/v1/rpc/generate_nutrition_week");
    const retry = nextRpcResponse(page, "generate_nutrition_week"); await dialog.getByRole("button", { name: "Save plan", exact: true }).click();
    const response = await retry; expect(response.ok()).toBe(true); expect(response.request().postDataJSON().p_payload.idempotencyKey).toBe(firstKey);
    await expect(dialog).not.toBeVisible(); await expect(generate).toBeEnabled(); await generate.click();
    await clear.click();
    await expect(choice).toBeEnabled(); await choices.getByText(name, { exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Preview · 0 meals", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save plan", exact: true })).toBeDisabled();
    await expect(choices.getByText("No whole servings remain in this week’s allowance.", { exact: true })).toHaveCount(0);
    await selectAll.click();
    expect(await choices.locator('input:checked').count()).toBe(await choices.getByRole("checkbox").count());
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.reload(); await expect(generate).toBeEnabled();
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(generate).toBeEnabled();
    await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: `View recipe: ${name}`, exact: true }).click();
    await overview.getByRole("button", { name: "Edit", exact: true }).click();
    await edit.getByLabel("Recipe servings", { exact: true }).fill("40");
    const expanded = nextRpcResponse(page, "save_recipe"); await edit.getByRole("button", { name: "Save changes", exact: true }).click();
    const expandedResponse = await expanded;
    if (!expandedResponse.ok()) {
      // The recovered editor predates the generated grocery revision.
      await edit.getByRole("button", { name: "Use latest version", exact: true }).click();
      await expect(edit.getByLabel("Recipe servings", { exact: true })).toHaveValue("40");
      const reviewed = nextRpcResponse(page, "save_recipe"); await edit.getByRole("button", { name: "Save changes", exact: true }).click();
      const response = await reviewed; expect(response.ok(), await response.text()).toBe(true);
    }
    await overview.getByRole("button", { name: "Close", exact: true }).click();
    await generate.click();
    await expect(dialog.getByRole("button", { name: "Review updated preview", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Review updated preview", exact: true }).click();
    await clear.click();
    await choices.getByText(name, { exact: true }).click();
    await expect(dialog.getByRole("region", { name: "Unused servings" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save plan", exact: true })).toBeDisabled();
    await dialog.getByRole("checkbox", { name: /^I reviewed the assignments/ }).check();
    await expect(dialog.getByRole("button", { name: "Save plan", exact: true })).toBeEnabled();
    await dialog.screenshot({ path: `output/weekly-generation/dialog-normal-${info.project.name}.png` });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("recipe unit conversions retain amounts and recover pending confirmations", async ({ browser }, info) => {
  const account = await createLocalAccount(`unit-conversions-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  try {
    await completeOnboarding(page, "Unit Conversions"); await openNutritionPage(page);
    await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true }).click();
    const overview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
    await overview.getByRole("tab", { name: "Ingredients", exact: true }).click();
    await expect(overview.getByText("2 tbsp", { exact: true })).toBeVisible();
    await expect(overview.getByText("2 cloves", { exact: true })).toBeVisible();
    await expect(overview.getByText("½ cucumber", { exact: true })).toBeVisible();
    await overview.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit recipe", exact: true });
    const name = `Converted Bowl ${info.project.name}`;
    await editor.getByLabel("Recipe name", { exact: true }).fill(name);
    await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
    for (const picker of await editor.getByRole("combobox").filter({ has: page.locator('option[value="kg"]') }).all()) {
      expect(await picker.locator("option").allTextContents()).toEqual(["g", "kg", "mg", "oz", "ml", "tsp", "tbsp", "cups", "piece/s"]);
    }
    await expect(editor.getByLabel("Garlic unit", { exact: true })).toHaveValue("piece");
    await expect(editor.getByLabel("Garlic quantity", { exact: true })).toHaveValue("2");
    const soyQuantity = editor.getByLabel("Soy sauce quantity", { exact: true });
    await editor.getByLabel("Soy sauce unit", { exact: true }).selectOption("tsp");
    await expect(soyQuantity).toHaveValue("6");
    await editor.getByLabel("Soy sauce unit", { exact: true }).selectOption("g"); await expect(soyQuantity).toHaveValue("32");
    await editor.getByLabel("Soy sauce unit", { exact: true }).selectOption("tbsp"); await expect(soyQuantity).toHaveValue("2");
    await editor.getByLabel("Honey unit", { exact: true }).selectOption("tsp");
    await expect(editor.getByLabel("Honey quantity", { exact: true })).toHaveValue("3");
    const beefQuantity = editor.getByLabel("Beef mince, 5% fat quantity", { exact: true });
    const beefUnit = editor.getByLabel("Beef mince, 5% fat unit", { exact: true });
    const confirmation = editor.getByRole("region", { name: "Confirm conversion for Beef mince, 5% fat", exact: true });
    const factor = confirmation.getByLabel("Beef mince, 5% fat conversion grams per cup", { exact: true });
    await beefUnit.selectOption("cup"); await expect(factor).toBeFocused();
    await expect(beefQuantity).toHaveValue("600"); await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
    await factor.fill("0"); await expect(confirmation.getByRole("button", { name: "Confirm conversion", exact: true })).toBeDisabled();
    await confirmation.getByRole("button", { name: "Cancel conversion", exact: true }).click();
    await expect(beefQuantity).toHaveValue("600"); await expect(beefUnit).toHaveValue("g"); await expect(beefQuantity).toBeFocused();
    await beefUnit.selectOption("cup"); await factor.fill("200");
    await expect(confirmation).toContainText("≈3 cup");
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await overview.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(editor.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
    await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
    await expect(factor).toHaveValue("200"); await expect(factor).toBeFocused(); await expect(beefQuantity).toHaveValue("600");
    if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" }); await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await confirmation.evaluate(node => [node, ...node.querySelectorAll("*")].every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
    await factor.scrollIntoViewIfNeeded();
    await editor.screenshot({ path: `output/recipe-unit-conversions/confirmation-${info.project.name}.png` });
    const confirm = confirmation.getByRole("button", { name: "Confirm conversion", exact: true });
    await confirm.scrollIntoViewIfNeeded(); await expect(confirm).toBeInViewport(); await confirm.click();
    await expect(beefQuantity).toHaveValue("3"); await expect(beefQuantity).toBeFocused();
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await editor.getByRole("tab", { name: "Details", exact: true }).click();
    await expect(editor.getByLabel("Provided calories (kcal)", { exact: true })).toHaveValue("560");
    const response = nextRpcResponse(page, "save_recipe"); await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    expect((await response).ok()).toBe(true); await overview.getByRole("button", { name: "Close", exact: true }).click();
    await page.reload(); await page.getByRole("button", { name: `View recipe: ${name}`, exact: true }).click();
    await overview.getByRole("tab", { name: "Ingredients", exact: true }).click();
    await expect(overview.getByText("3 cup", { exact: true })).toBeVisible(); await expect(overview.getByText("3 tsp", { exact: true })).toBeVisible();
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("recipe review confirms pending nutrition bases in Details and saves recovered ingredients", async ({ browser }, info) => {
  const account = await createLocalAccount(`review-basis-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  const candidate = (name: string, fdcId: string) => ({ fdcId, recordType: "Foundation", name, servingLabel: "100 g", servingGrams: 100, unit: "g", calories: 120, proteinG: 8, carbsG: 20, fatG: 0, nutrientsPer100g: { calories: 120, proteinG: 8, carbsG: 20, fatG: 0 }, source: "USDA FoodData Central", sourceVersion: "test", estimated: false, confidence: "high", preparationBasis: "prepared" });
  const names = ["Broccoli test", "Sesame oil test", "Salt test"];
  try {
    await completeOnboarding(page, "Review Basis");
    const editor = await openRecipe(page);
    const recipeName = `Reviewed weights ${info.project.name}`;
    await editor.getByLabel("Recipe name", { exact: true }).fill(recipeName);
    await editor.getByLabel("Recipe servings", { exact: true }).fill("4");
    await fillRecipeSection(editor, "Instructions", "Instructions (required)", "Mix and serve.");
    await editor.getByLabel("Ingredient search").fill("Greek yogurt");
    await editor.getByRole("button", { name: /Greek yogurt.*170 g/ }).click();
    await editor.getByLabel("Greek yogurt quantity", { exact: true }).fill("100");
    await page.route("**/functions/v1/nutrition-text-parse", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestedMealName: "Vegetables", candidates: [...names.map((name, index) => ({ name, quantity: [680, 1.5, 1][index], unit: ["g", "tbsp", "tsp"][index], preparation: "prepared", assumptions: [], confidence: "high", presence: "stated" })), { name: "Possible garnish", quantity: 1, unit: "tsp", preparation: "prepared", assumptions: [], confidence: "low", presence: "possible_hidden" }], questions: [] }) }));
    await page.route("**/functions/v1/nutrition-meal-match", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ matches: names.map((name, ingredientIndex) => ({ ingredientIndex, query: name, candidates: [candidate(name, `review-basis-${ingredientIndex}`)] })) }) }));
    await page.route("**/functions/v1/nutrition-search", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [candidate("Salt test", "review-basis-2")] }) }));
    await editor.getByRole("button", { name: "Describe ingredients", exact: true }).click();
    await editor.getByLabel("Ingredient description").fill("Broccoli with sesame oil and salt");
    await editor.getByRole("button", { name: "Analyze ingredients", exact: true }).click();
    const review = editor.getByRole("region", { name: "Ingredient review", exact: true });
    const saltRow = review.getByRole("listitem").filter({ has: page.getByLabel("Salt test quantity", { exact: true }) });
    const oilRow = review.getByRole("listitem").filter({ has: page.getByLabel("Sesame oil test quantity", { exact: true }) });
    const add = review.getByRole("button", { name: "Add selected ingredients", exact: true });
    await expect(add).toBeDisabled();
    for (const name of names) await review.getByRole("checkbox", { name, exact: true }).uncheck();
    await expect(review.getByText("Select at least one suggested ingredient to add.", { exact: true })).toBeVisible();
    await expect(add).toBeDisabled();
    for (const name of names) await review.getByRole("checkbox", { name, exact: true }).check();
    await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await expect(editor.getByText("Finish ingredient review, then choose Add selected ingredients before saving.")).toBeVisible();
    await oilRow.getByRole("button", { name: "Review nutrition basis", exact: true }).click();
    const pending = editor.getByRole("region", { name: "Ingredients awaiting addition", exact: true });
    const oil = pending.getByLabel("Sesame oil test grams per tbsp", { exact: true });
    const salt = pending.getByLabel("Salt test grams per tsp", { exact: true });
    await expect(oil).toBeFocused();
    await expect(pending.getByText("Not selected for addition", { exact: true })).toHaveCount(1);
    await expect(editor.getByRole("region", { name: "Recipe ingredients", exact: true }).getByText("Greek yogurt", { exact: true })).toBeVisible();
    await oil.fill("14"); await salt.fill("0");
    await expect(salt).toHaveAttribute("aria-invalid", "true");
    await expect(pending.getByRole("alert")).toHaveText("Enter a positive finite weight up to 1,000,000 g.");
    await pending.getByRole("button", { name: "Return to ingredient review", exact: true }).click();
    await expect(review.getByRole("checkbox", { name: "Sesame oil test", exact: true })).toBeFocused();
    await expect(add).toBeDisabled();
    await saltRow.getByRole("button", { name: "Review nutrition basis", exact: true }).click();
    await expect(salt).toBeFocused(); await salt.fill("6");
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.reload();
    await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true }).click();
    await expect(editor.getByText("Recipe draft restored.", { exact: true })).toBeVisible();
    await expect(oil).toHaveValue("14"); await expect(salt).toHaveValue("6");
    await pending.getByRole("button", { name: "Return to ingredient review", exact: true }).click();
    await expect(add).toBeFocused();
    // Even reselecting a source must discard the old ingredient-specific factor.
    await saltRow.getByRole("button", { name: "Choose or change match", exact: true }).click();
    await editor.getByRole("button", { name: "Search trusted USDA", exact: true }).click();
    await editor.getByRole("button", { name: /Salt test.*100 g/ }).click();
    await expect(saltRow.getByLabel("Salt test quantity", { exact: true })).toHaveValue("1");
    await expect(add).toBeDisabled();
    await saltRow.getByRole("button", { name: "Review nutrition basis", exact: true }).click();
    await expect(salt).toHaveValue(""); await salt.fill("6");
    await page.setViewportSize({ width: info.project.name === "mobile" ? 320 : 973, height: 930 });
    await pending.getByRole("heading", { name: "Ingredients awaiting addition", exact: true }).scrollIntoViewIfNeeded();
    await editor.screenshot({ path: `output/recipe-review-basis/overview-${info.project.name}.png` });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await salt.scrollIntoViewIfNeeded();
    expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect(await pending.evaluate(node => [node, ...node.querySelectorAll("*")].every(element => element.scrollWidth <= element.clientWidth + 1))).toBe(true);
    await editor.screenshot({ path: `output/recipe-review-basis/details-${info.project.name}.png` });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await pending.getByRole("button", { name: "Return to ingredient review", exact: true }).press("Enter");
    await expect(add).toBeFocused(); await add.press("Enter");
    await expect(editor.getByLabel("Broccoli test quantity", { exact: true })).toBeFocused();
    await expect(review.getByRole("listitem")).toHaveCount(1);
    await expect(review.getByRole("checkbox", { name: "Possible garnish", exact: true })).not.toBeChecked();
    await expect(editor.getByRole("button", { name: "Remove Sesame oil test", exact: true })).toHaveCount(1);
    await expect(editor.getByLabel("Sesame oil test quantity", { exact: true })).toHaveValue("1.5");
    await page.route("**/rest/v1/rpc/save_recipe", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary save failure" }) }));
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor.getByText(/Recipe was not saved/)).toBeVisible();
    await expect(editor.getByLabel("Sesame oil test quantity", { exact: true })).toHaveValue("1.5");
    await page.unroute("**/rest/v1/rpc/save_recipe");
    const saved = nextRpcResponse(page, "save_recipe"); await editor.getByRole("button", { name: "Save", exact: true }).click();
    const response = await saved; expect(response.ok(), await response.text()).toBe(true);
    const ingredients = response.request().postDataJSON().p_payload.meal.ingredients;
    expect(ingredients).toHaveLength(4);
    expect(ingredients.find((item: { foodId: string }) => item.foodId === "food-fdc-review-basis-1")).toMatchObject({ servings: .21, cookingMeasurement: { quantity: 1.5, unit: "tbsp", gramsPerUnit: 14 } });
    await expect(editor).toHaveCount(0); await page.reload();
    await page.getByRole("button", { name: `View recipe: ${recipeName}`, exact: true }).click();
    const overview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
    await overview.getByRole("tab", { name: "Ingredients", exact: true }).click();
    await expect(overview.getByText("1.5 tbsp", { exact: true })).toBeVisible();
    await expect(overview.getByText("1 tsp", { exact: true })).toBeVisible();
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("recipe authoring normalizes legacy draft units and unmatched volume suggestions", async ({ page }, info) => {
  const editor = await openRecipe(page);
  await editor.getByLabel("Recipe name", { exact: true }).fill("Recovered units");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await editor.getByLabel("Ingredient search").fill("Greek yogurt");
  await editor.getByRole("button", { name: /Greek yogurt.*170 g/ }).click();
  await editor.getByLabel("Greek yogurt quantity", { exact: true }).fill("100");
  await editor.getByLabel("Greek yogurt unit", { exact: true }).selectOption("ml");
  const conversion = editor.getByRole("region", { name: "Confirm conversion for Greek yogurt", exact: true });
  await conversion.getByLabel("Greek yogurt conversion grams per ml", { exact: true }).fill("1");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(async () => {
    const request = indexedDB.open("calicoach-drafts");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite"), read = tx.objectStore("drafts").openCursor();
      read.onsuccess = () => { const cursor = read.result; if (!cursor) return; const record = cursor.value, value = record.value ?? record;
        if (value.draftType === "recipe:new" && value.payload.name === "Recovered units") {
          value.payload.ingredients[0].pendingConversion = { unit: "l", gramsPerUnit: "1000" };
          cursor.update(record);
        } cursor.continue(); };
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    }); db.close();
  });
  await page.reload();
  await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true }).click();
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await expect(editor.getByLabel("Greek yogurt unit", { exact: true })).toHaveValue("ml");
  await expect(conversion.getByLabel("Greek yogurt conversion grams per ml", { exact: true })).toHaveValue("1");
  await conversion.getByRole("button", { name: "Confirm conversion", exact: true }).click();
  await expect(editor.getByLabel("Greek yogurt quantity", { exact: true })).toHaveValue("100");
  await page.route("**/functions/v1/nutrition-text-parse", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestedMealName: "Vegetables", candidates: [{ name: "Unmatched vegetable", quantity: 3, unit: "cups", preparation: "raw", assumptions: [], confidence: "medium", presence: "stated" }], questions: [] }) }));
  await page.route("**/functions/v1/nutrition-meal-match", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ matches: [] }) }));
  await editor.getByRole("button", { name: "Describe ingredients", exact: true }).click();
  await editor.getByLabel("Ingredient description").fill("3 cups of vegetables");
  await editor.getByRole("button", { name: "Analyze ingredients", exact: true }).click();
  const review = editor.getByRole("region", { name: "Ingredient review" });
  const unit = review.getByLabel("Unmatched vegetable unit", { exact: true });
  await expect(review.getByLabel("Unmatched vegetable quantity", { exact: true })).toHaveValue("3");
  await expect(unit).toHaveValue("cup");
  expect(await unit.locator("option").allTextContents()).toEqual(["g", "kg", "mg", "oz", "ml", "tsp", "tbsp", "cups", "piece/s"]);
  await unit.selectOption("tsp");
  await expect(review.getByLabel("Unmatched vegetable quantity", { exact: true })).toHaveValue("144");
  await expect(review.getByRole("button", { name: "Add selected ingredients", exact: true })).toBeDisabled();
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await unit.scrollIntoViewIfNeeded();
  expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await editor.screenshot({ path: `output/restricted-recipe-units/recovered-units-${info.project.name}.png` });
});

test("recipe original measurements recover from a stale snapshot and failed refresh", async ({ page }) => {
  const editor = await openRecipe(page);
  await editor.getByLabel("Recipe name", { exact: true }).fill("Retained during recipe refresh");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.addInitScript(() => {
    const stream: unknown[] = [];
    const push = stream.push.bind(stream);
    stream.push = (...entries) => push(...entries.map(entry => Array.isArray(entry) ? entry.map(value => typeof value === "string" ? value.replaceAll("cookingMeasurement", "legacyCookingMeasurement") : value) : entry));
    (window as typeof window & { __next_f: unknown[] }).__next_f = stream;
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Add meal", exact: true }).first()).toBeEnabled();
  let failedReads = 0;
  await page.route("**/rest/v1/meal_ingredients*", async route => { failedReads += 1; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary recipe read failure" }) }); });
  await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true }).click();
  await expect(page.getByText(/Original recipe measurements could not be loaded/)).toBeVisible();
  expect(failedReads).toBeGreaterThan(0); await expect(page.getByRole("dialog", { name: "Recipe overview", exact: true })).toHaveCount(0);
  await page.unroute("**/rest/v1/meal_ingredients*"); await page.getByRole("button", { name: "Retry recipe", exact: true }).click();
  const overview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
  await expect(overview).toBeVisible(); await expect(page.getByText("Current account data refreshed.", { exact: true })).toHaveCount(0);
  await overview.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await expect(overview.getByText("2 tbsp", { exact: true })).toBeVisible();
  await expect(overview.getByText("½ cucumber", { exact: true })).toBeVisible();
  await overview.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true }).click();
  await expect(editor.getByLabel("Recipe name", { exact: true })).toHaveValue("Retained during recipe refresh");
  await editor.getByRole("button", { name: "Discard draft", exact: true }).click();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("recipe cooking measurements open Details first and preserve original units through personal edits", async ({ browser }, info) => {
  const account = await createLocalAccount(`cooking-measurements-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  try {
  await completeOnboarding(page, "Cooking Measurements");
  await openNutritionPage(page); await clearBrowserDrafts(page);
  const saved = page.getByRole("region", { name: "Recipes" });
  await page.route("**/images/recipes/creamy-lemon-chicken.png", route => route.fulfill({ status: 503, body: "Image temporarily unavailable" }));
  await saved.getByRole("button", { name: "View recipe: Creamy Lemon Chicken", exact: true }).click();
  const overview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
  await expect(overview.getByText("Image unavailable · default shown", { exact: true })).toBeVisible();
  await page.unroute("**/images/recipes/creamy-lemon-chicken.png");
  await overview.getByRole("button", { name: "Retry image", exact: true }).click();
  await expect(overview.getByText("Image unavailable · default shown", { exact: true })).toHaveCount(0);
  await expect(overview.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(overview.getByText("Recipe image", { exact: true })).toHaveCount(0);
  await expect(overview.getByText("30 mins", { exact: true })).toBeVisible();
  await expect(overview.getByRole("group", { name: "Recipe nutrition per serving" })).toBeVisible();
  await overview.getByRole("tab", { name: "Ingredients", exact: true }).click();
  const ingredients = overview.getByRole("tabpanel", { name: "Ingredients", exact: true });
  for (const text of ["400 g", "25–30 g", "300 ml", "Juice of 1 lemon", "Salt", "Pepper", "Chicken bouillon powder", "MSG"]) await expect(ingredients.getByText(text, { exact: true })).toBeVisible();
  await expect(ingredients.getByRole("group", { name: "Recipe nutrition per serving" })).toHaveCount(0);
  await expect(ingredients.getByText(/USDA FoodData Central/)).toHaveCount(0);
  await overview.getByRole("tab", { name: "Instructions", exact: true }).click();
  await expect(overview.getByRole("tabpanel", { name: "Instructions", exact: true }).getByText(/Nutrition estimate:/)).toHaveCount(0);
  await overview.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit recipe", exact: true });
  await expect(editor.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await editor.getByLabel("Recipe name", { exact: true }).fill("Cooking Chicken " + info.project.name);
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await expect(editor.getByLabel("Milk quantity", { exact: true })).toHaveValue("300");
  await expect(editor.getByLabel("Milk unit", { exact: true })).toHaveValue("ml");
  await expect(editor.getByLabel("Butter quantity", { exact: true })).toHaveValue("25");
  await expect(editor.getByLabel("Butter upper quantity", { exact: true })).toHaveValue("30");
  await editor.getByLabel("Milk quantity", { exact: true }).fill("200");
  const panel = editor.getByRole("tabpanel", { name: "Ingredients", exact: true });
  await expect(panel.getByRole("group", { name: "Recipe nutrition per serving" })).toHaveCount(0);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await overview.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editor.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await expect(editor.getByLabel("Milk quantity", { exact: true })).toHaveValue("200");
  let key = "";
  await page.route("**/rest/v1/rpc/save_recipe", route => { key = route.request().postDataJSON().p_payload.idempotencyKey; return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "temporary save failure" }) }); });
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor.getByText(/Recipe was not saved/)).toBeVisible();
  await expect(editor.getByLabel("Milk unit", { exact: true })).toHaveValue("ml");
  await page.unroute("**/rest/v1/rpc/save_recipe");
  const response = nextRpcResponse(page, "save_recipe");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  const result = await response; expect(result.ok()).toBe(true); expect(result.request().postDataJSON().p_payload.idempotencyKey).toBe(key);
  await expect(overview.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await overview.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await saved.getByRole("button", { name: "View recipe: Cooking Chicken " + info.project.name, exact: true }).click();
  await expect(overview.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await overview.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await expect(overview.getByText("200 ml", { exact: true })).toBeVisible();
  await expect(overview.getByText("25–30 g", { exact: true })).toBeVisible();
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await overview.getByRole("tabpanel", { name: "Ingredients", exact: true }).evaluate(node => [node, ...node.querySelectorAll("*")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.tagName))).toEqual([]);
  const headingBounds = await overview.getByRole("heading", { name: "Recipe overview", exact: true }).boundingBox();
  const closeBounds = await overview.getByRole("button", { name: "Close recipe overview", exact: true }).boundingBox();
  expect(headingBounds!.x + headingBounds!.width).toBeLessThanOrEqual(closeBounds!.x);
  await overview.getByRole("tabpanel", { name: "Ingredients", exact: true }).scrollIntoViewIfNeeded();
  await overview.screenshot({ path: `output/recipe-measurements/cooking-overview-${info.project.name}.png` });
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("predefined recipe catalog displays the replacement image, complete metadata and source", async ({ page }, info) => {
  await openNutritionPage(page);
  const saved = page.getByRole("region", { name: "Recipes" });
  const row = saved.getByRole("listitem").filter({ has: page.getByRole("button", { name: "View recipe: Creamy Lemon Chicken", exact: true }) });
  await expect(row).toBeVisible();
  for (const name of ["Greek Yogurt Berry Bowl", "PB Banana Toast", "Chicken & Rice Plate", "Salmon & Sweet Potato", "Egg, Broccoli & Almond Plate", "Chicken & Broccoli Plate", "Tofu & Broccoli Plate", "Tofu, Broccoli & Almond Bowl"]) {
    await expect(saved.getByRole("button", { name: `View recipe: ${name}`, exact: true })).toHaveCount(0);
  }
  const cover = row.locator("img");
  await expect(cover).toHaveAttribute("src", "/images/recipes/creamy-lemon-chicken.png");
  await expect.poll(() => cover.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
  await expect(row.getByText("≈695 kcal", { exact: true })).toBeVisible();
  await expect(row.getByText("30 mins", { exact: true })).toBeVisible();
  await expect(row.getByText("Easy", { exact: true })).toBeVisible();
  await row.screenshot({ path: `output/recipe-catalog/card-${info.project.name}.png` });
  await row.getByRole("button", { name: "View recipe: Creamy Lemon Chicken", exact: true }).click();
  const overview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
  await overview.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(overview.getByRole("link", { name: /7647909556240076033/ })).toBeVisible();
  await expect(overview.getByRole("group", { name: "Recipe nutrition per serving" })).toBeVisible();
  await overview.getByRole("tab", { name: "Instructions", exact: true }).click();
  await expect(overview.getByRole("tabpanel", { name: "Instructions", exact: true }).getByText(/Nutrition estimate:/)).toHaveCount(0);
  await overview.getByRole("button", { name: "Close", exact: true }).click();
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  if (info.project.name === "mobile") expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
  expect(await row.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});

test("Korean Beef Bowl keeps provided macros and supports personal edit and archive", async ({ browser, page }, info) => {
  const account = await createLocalAccount(`catalog-controls-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const recipePage = await context.newPage();
  await recipePage.setViewportSize({ width: info.project.name === "mobile" ? 390 : 1440, height: 900 });
  try {
    await completeOnboarding(recipePage, "Recipe Controls");
    await openNutritionPage(recipePage);
    const saved = recipePage.getByRole("region", { name: "Recipes" });
    const card = (name: string) => saved.getByRole("listitem").filter({ has: recipePage.getByRole("button", { name: `View recipe: ${name}`, exact: true }) });
    const original = card("Korean Beef Bowl");
    await expect(original.getByText("≈560 kcal", { exact: true })).toBeVisible();
    await expect(original.getByText("Not set", { exact: true })).toBeVisible();
    await expect(original.locator("img")).toHaveAttribute("src", "/images/recipes/korean-beef-bowl.png");
    await expect(original.getByRole("button", { name: "Edit Korean Beef Bowl", exact: true })).toBeEnabled();
    await original.screenshot({ path: `output/korean-beef-bowl/card-${info.project.name}.png` });
    await openNutritionSlot(recipePage, "Lunch");
    await recipePage.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true }).fill("korean beef bowl");
    await recipePage.getByRole("region", { name: "Saved recipes matches" }).getByRole("button", { name: /Korean Beef Bowl/ }).click();
    const logReview = recipePage.getByRole("group", { name: "Review recipe servings", exact: true });
    await logReview.getByLabel("Recipe servings", { exact: true }).fill("4");
    let response = nextRpcResponse(recipePage, "save_reviewed_meal");
    await logReview.getByRole("button", { name: "Log meal", exact: true }).click();
    expect((await response).ok()).toBe(true);
    const logged = recipePage.getByRole("region", { name: "Planned" }).getByRole("listitem").filter({ has: recipePage.getByRole("button", { name: "Delete Korean Beef Bowl", exact: true }) });
    await expect(logged.getByText("2240 kcal", { exact: true })).toBeVisible();
    await original.getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true }).click();
    const overview = recipePage.getByRole("dialog", { name: "Recipe overview", exact: true });
    await expect(overview.getByRole("heading", { name: "Per serving · source-provided macros", exact: true })).toBeVisible();
    await overview.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = recipePage.getByRole("dialog", { name: "Edit recipe", exact: true });
    await expect(editor.getByLabel("Provided calories (kcal)", { exact: true })).toHaveValue("560");
    await editor.getByLabel("Provided calories (kcal)", { exact: true }).fill("");
    await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
    await expect(editor.getByText("Check all four provided macro values.", { exact: true })).toBeVisible();
    await editor.getByLabel("Provided calories (kcal)", { exact: true }).fill("560");
    await editor.getByLabel("Recipe name", { exact: true }).fill("My Korean Beef Bowl");
    await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
    await editor.getByLabel("Beef mince, 5% fat quantity", { exact: true }).fill("500");
    await editor.getByRole("tab", { name: "Details", exact: true }).click();
    await expect(editor.getByLabel("Provided calories (kcal)", { exact: true })).toHaveValue("560");
    await recipePage.route("**/rest/v1/rpc/save_recipe", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "temporary failure" }) }));
    response = nextRpcResponse(recipePage, "save_recipe");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    expect((await response).ok()).toBe(false);
    await expect(editor.getByLabel("Recipe name", { exact: true })).toHaveValue("My Korean Beef Bowl");
    await recipePage.unroute("**/rest/v1/rpc/save_recipe");
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await overview.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(editor.getByText("Recipe draft restored.", { exact: true })).toBeVisible();
    await expect(editor.getByLabel("Provided calories (kcal)", { exact: true })).toHaveValue("560");
    response = nextRpcResponse(recipePage, "save_recipe");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await overview.getByRole("button", { name: "Close", exact: true }).click();
    await expect(original).toHaveCount(0);
    await expect(card("My Korean Beef Bowl").getByText("≈560 kcal", { exact: true })).toBeVisible();
    await recipePage.reload();
    await expect(card("My Korean Beef Bowl")).toBeVisible();
    await expect(logged.getByText("2240 kcal", { exact: true })).toBeVisible();
    response = nextRpcResponse(recipePage, "archive_saved_meal");
    await archiveRecipeFromCard(recipePage, card("Creamy Lemon Chicken"));
    expect((await response).ok()).toBe(true);
    await recipePage.reload();
    await expect(card("Creamy Lemon Chicken")).toHaveCount(0);
    await page.goto("/nutrition");
    await expect(page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "View recipe: Creamy Lemon Chicken", exact: true })).toBeVisible();
    await recipePage.emulateMedia({ reducedMotion: "reduce" });
    if (info.project.name === "mobile") await recipePage.setViewportSize({ width: 320, height: 900 });
    await recipePage.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await recipePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  } catch (error) {
    await info.attach("recipe-controls-state", { body: await recipePage.locator("body").innerText(), contentType: "text/plain" });
    throw error;
  } finally {
    await context.close();
    await deleteLocalAccount(account);
  }
});

test("saved recipe favorites persist while compact planned rows retain logging and focus", async ({ page }, info) => {
  await openNutritionPage(page);
  const planned = page.getByRole("region", { name: "Planned" });
  const recipeTitle = planned.getByRole("button", { name: /^View recipe: / }).first();
  const name = (await recipeTitle.getAttribute("aria-label"))!.replace("View recipe: ", "");
  const plannedCard = planned.getByRole("listitem").filter({ has: page.getByRole("button", { name: `View recipe: ${name}`, exact: true }) }).first();
  const saved = page.getByRole("region", { name: "Recipes" });
  const savedCard = saved.getByRole("listitem").filter({ has: page.getByRole("button", { name: `View recipe: ${name}`, exact: true }) });
  const heart = savedCard.getByRole("button", { name: `Add to favorites: ${name}`, exact: true });
  await expect(heart).toBeEnabled();
  const edit = plannedCard.getByRole("button", { name: "Edit", exact: true });
  await edit.click();
  await expect(plannedCard.getByRole("combobox", { name: "Planned meal choice", exact: true })).toBeFocused();
  await plannedCard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edit).toBeFocused();
  let started!: () => void;
  const pending = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/rest/v1/rpc/set_recipe_favorite", async route => { started(); await new Promise(resolve => setTimeout(resolve, 300)); await route.continue(); });
  let response = nextRpcResponse(page, "set_recipe_favorite");
  await heart.click(); await pending;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await response).ok()).toBe(true);
  await page.unroute("**/rest/v1/rpc/set_recipe_favorite");
  const remove = savedCard.getByRole("button", { name: `Remove from favorites: ${name}`, exact: true });
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await expect(plannedCard.locator("img")).toHaveCount(0);
  await expect(plannedCard.getByRole("button", { name: /favorites:/ })).toHaveCount(0);
  await expect(plannedCard.getByRole("group", { name: "Planned portion nutrition", exact: true })).toBeVisible();
  await plannedCard.screenshot({ path: `output/recipe-cards/planned-${info.project.name}.png` });
  await page.reload(); await expect(remove).toBeEnabled();
  await page.route("**/rest/v1/rpc/set_recipe_favorite", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "temporary failure" }) }));
  response = nextRpcResponse(page, "set_recipe_favorite"); await remove.click(); expect((await response).ok()).toBe(false);
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await page.unroute("**/rest/v1/rpc/set_recipe_favorite");
  await saved.getByRole("button", { name: "Refresh cards", exact: true }).click();
  await expect(remove).toBeEnabled();
  await plannedCard.getByRole("button", { name: "Log", exact: true }).click();
  await plannedCard.getByRole("spinbutton", { name: "Actual servings", exact: true }).fill("1.5");
  response = nextRpcResponse(page, "log_planned_meal");
  await plannedCard.getByRole("button", { name: "Confirm log", exact: true }).click(); expect((await response).ok()).toBe(true);
  await expect(savedCard.getByText("Popular", { exact: true })).toBeVisible();
  await expect(remove).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  if (info.project.name === "mobile") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);
    expect(await savedCard.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await savedCard.scrollIntoViewIfNeeded();
  await savedCard.screenshot({ path: `test-results/recipe-card-${info.project.name}.png` });
  response = nextRpcResponse(page, "set_recipe_favorite"); await remove.click(); expect((await response).ok()).toBe(true);
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  const eaten = planned.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Delete ${name}`, exact: true }) }).last();
  response = nextRpcResponse(page, "delete_logged_meal");
  await eaten.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(plannedCard.getByRole("button", { name: "Log", exact: true })).toBeVisible();
});

test("recipe archive confirmation retains drafts, retries safely and preserves history", async ({ browser }, info) => {
  test.setTimeout(240_000);
  const account = await createLocalAccount(`archive-editor-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.setViewportSize({ width: info.project.name === "mobile" ? 367 : 1440, height: 930 });
  try {
    await completeOnboarding(page, "Archive editor"); await openNutritionPage(page);
    const recipes = page.getByRole("region", { name: "Recipes", exact: true });
    const create = recipes.getByRole("button", { name: "Create", exact: true });
    const card = (name: string) => recipes.locator(".recipe-card").filter({ has: page.getByRole("button", { name: `View recipe: ${name}`, exact: true }) });
    await expect(recipes.getByRole("button", { name: /^Archive / })).toHaveCount(0);
    await create.click();
    const creation = page.getByRole("dialog", { name: "Create recipe", exact: true });
    await expect(creation.getByRole("button", { name: "Archive recipe", exact: true })).toHaveCount(0);
    await creation.getByRole("button", { name: "Cancel", exact: true }).click();
    const name = "Korean Beef Bowl";
    const lunch = page.getByRole("region", { name: "Lunch", exact: true });
    async function reviewBeef() {
      await lunch.getByRole("button", { name: "Add meal", exact: true }).click();
      await page.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true }).fill("korean beef bowl");
      await page.getByRole("region", { name: "Saved recipes matches" }).getByRole("button", { name: /Korean Beef Bowl/ }).click();
      const review = page.getByRole("group", { name: "Review recipe servings", exact: true });
      await review.getByLabel("Recipe servings", { exact: true }).fill("0.5"); return review;
    }
    const planReview = await reviewBeef(); const plannedResponse = nextRpcResponse(page, "add_planned_meal");
    await planReview.getByRole("button", { name: "Add to plan", exact: true }).click();
    const plannedId = (await plannedResponse).request().postDataJSON().p_payload.plannedMeal.id as string;
    const logReview = await reviewBeef(); await logReview.getByRole("button", { name: "Log meal", exact: true }).click();
    await expect(lunch.getByRole("button", { name: "Delete Korean Beef Bowl", exact: true })).toBeVisible();
    await expect(card(name).getByRole("img", { name: "Approximately 560 calories per serving", exact: true })).toHaveCSS("background-color", "rgb(255, 171, 179)");
    await card(name).getByRole("button", { name: `View recipe: ${name}`, exact: true }).click();
    const overview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
    await overview.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit recipe", exact: true, includeHidden: true });
    const archive = editor.getByRole("button", { name: "Archive recipe", exact: true, includeHidden: true });
    const confirmation = page.getByRole("dialog", { name: "Archive recipe?", exact: true });
    const archiveAction = confirmation.getByRole("button", { name: "Archive recipe", exact: true });
    await expect(archive).toBeEnabled();
    await expect(archive).toHaveText("");
    await expect(editor).not.toContainText("Archiving hides this saved recipe from Recipes.");
    await expect(archive).toHaveCSS("background-color", "rgb(254, 202, 202)");
    await expect(archive).toHaveCSS("color", "rgb(127, 29, 29)");
    await editor.getByRole("textbox", { name: "Recipe name", exact: true }).fill("");
    await expect(editor.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
    await expect(archive).toBeEnabled();
    await editor.getByRole("tab", { name: "Instructions", exact: true }).click();
    await editor.getByRole("textbox", { name: "Instructions (required)", exact: true }).fill("An unsaved draft that must survive cancellation and failure.");
    await archive.scrollIntoViewIfNeeded();
    await archive.focus();
    const archiveTooltip = page.getByRole("tooltip", { name: "Archive recipe", exact: true });
    await expect(archiveTooltip).toBeVisible(); await expect(archiveTooltip).toBeInViewport();
    expect(await editor.locator("[data-modal-footer]").getByRole("tooltip").count()).toBe(0);
    await page.keyboard.press("Escape"); await expect(archiveTooltip).toHaveCount(0); await expect(editor).toBeVisible();
    const scrollTop = await editor.locator("[data-modal-body]").evaluate(node => node.scrollTop);
    let archiveRequests = 0, saveRequests = 0;
    page.on("request", request => { if (request.url().endsWith("/rpc/archive_saved_meal")) archiveRequests++; if (request.url().endsWith("/rpc/save_recipe")) saveRequests++; });
    await archive.click();
    await expect(confirmation.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
    await expect(confirmation.getByText(`Archive ${name}?`, { exact: true })).toBeVisible();
    for (let index = 0; index < 5; index++) { await page.keyboard.press("Tab"); await expect(confirmation.locator(":focus")).toHaveCount(1); }
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0); await expect(archive).toBeFocused();
    await expect(editor.getByRole("tab", { name: "Instructions", exact: true })).toHaveAttribute("aria-selected", "true");
    expect(await editor.locator("[data-modal-body]").evaluate(node => node.scrollTop)).toBeCloseTo(scrollTop, 0);
    await expect(editor.getByRole("textbox", { name: "Instructions (required)", exact: true })).toHaveValue("An unsaved draft that must survive cancellation and failure.");
    expect(archiveRequests).toBe(0);
    if (info.project.name === "desktop") {
      await archive.click(); await confirmation.locator("xpath=..").click({ position: { x: 1, y: 1 } });
      await expect(confirmation).toHaveCount(0); await expect(archive).toBeFocused();
    }
    await editor.getByRole("button", { name: "About edit recipe", exact: true }).click();
    await page.keyboard.press("Escape"); await expect(editor).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 367, 390, 469, 570, 594, 760, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      const cancel = editor.getByRole("button", { name: "Cancel", exact: true });
      const a = await archive.boundingBox(), c = await cancel.boundingBox();
      expect(a!.x + a!.width).toBeLessThanOrEqual(c!.x + 1); expect(a!.height).toBeGreaterThanOrEqual(44);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      const row = await Promise.all([archive, cancel, editor.getByRole("button", { name: "Save changes", exact: true })].map(control => control.boundingBox()));
      const center = row[0]!.y + row[0]!.height / 2;
      for (const box of row) { expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.y + box!.height / 2).toBeCloseTo(center, 0); }
      expect(row[0]!.width).toBe(44); expect(row[0]!.height).toBe(44);
      expect(row[0]!.x + row[0]!.width).toBeLessThanOrEqual(row[1]!.x);
      expect(row[1]!.x + row[1]!.width).toBeLessThanOrEqual(row[2]!.x);
      expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await archive.scrollIntoViewIfNeeded(); await expect(archive).toBeInViewport();
      await archive.click(); expect(await confirmation.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await confirmation.getByRole("button", { name: "Keep editing", exact: true }).click();
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      if (width === 367 || width === 1440) {
        await editor.screenshot({ path: `output/archive-danger/editor-${width}-${info.project.name}.png` });
        await archive.click(); await confirmation.screenshot({ path: `output/archive-danger/confirmation-${width}-${info.project.name}.png` });
        await confirmation.getByRole("button", { name: "Keep editing", exact: true }).click();
      }
    }
    await archive.click();
    await page.route("**/rest/v1/rpc/archive_saved_meal", route => route.fulfill({ status: 503, json: { message: "Temporary archive failure" } }));
    await archiveAction.click(); await expect(confirmation.getByRole("alert")).toContainText("Recipe was not archived");
    await expect(confirmation.getByRole("alert")).toHaveCSS("background-color", "rgb(254, 242, 242)");
    await expect(page.locator('[aria-live="polite"]').getByText("Temporary archive failure", { exact: true })).toHaveCSS("background-color", "rgb(254, 226, 226)");
    await expect(archiveAction).toBeEnabled();
    await page.unroute("**/rest/v1/rpc/archive_saved_meal");
    let release!: () => void, requested!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { requested = resolve; });
    let payload!: { idempotencyKey: string; mealId: string };
    await page.route("**/rest/v1/rpc/archive_saved_meal", async route => {
      payload = route.request().postDataJSON().p_payload; requested(); await held;
      const response = await route.fetch(); expect(response.ok()).toBe(true);
      await route.fulfill({ status: 503, json: { message: "Lost response after archive persisted" } });
    });
    await archiveAction.click(); await started;
    try {
      await expect(confirmation.getByRole("button", { name: "Keep editing", exact: true })).toBeDisabled();
      await expect(confirmation.getByRole("button", { name: "Close archive recipe?", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape"); await expect(confirmation).toBeVisible();
    } finally { release(); }
    await expect(confirmation.getByRole("alert")).toContainText("Recipe was not archived");
    expect(payload.mealId).toBe("meal-korean-beef-bowl");
    await page.unroute("**/rest/v1/rpc/archive_saved_meal");
    const retry = nextRpcResponse(page, "archive_saved_meal"); await archiveAction.click(); const response = await retry;
    expect(response.ok()).toBe(true); expect(response.request().postDataJSON().p_payload.idempotencyKey).toBe(payload.idempotencyKey);
    expect((await response.json()).replayed).toBe(true);
    await expect(editor).toHaveCount(0); await expect(confirmation).toHaveCount(0); await expect(overview).toHaveCount(0);
    await expect(create).toBeFocused(); await expect(card(name)).toHaveCount(0); expect(saveRequests).toBe(0);
    await expect.poll(() => page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("calicoach-drafts"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const values = await new Promise<Array<{ draftType?: string; value?: { draftType?: string } }>>((resolve, reject) => { const request = db.transaction("drafts").objectStore("drafts").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      db.close(); return values.some(value => (value.value ?? value).draftType === "recipe:meal-korean-beef-bowl");
    })).toBe(false);
    await page.reload(); await expect(card(name)).toHaveCount(0);
    await expect(page.locator(`[id="log-planned-${plannedId}"]`)).toBeVisible();
    await expect(lunch.getByRole("button", { name: "Delete Korean Beef Bowl", exact: true })).toBeVisible();
    // A different default can be customized, then archived as its owned version.
    await card("Creamy Lemon Chicken").getByRole("button", { name: "Edit Creamy Lemon Chicken", exact: true }).click();
    await editor.getByRole("textbox", { name: "Recipe name", exact: true }).fill("Personal archive fixture");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    const personal = card("Personal archive fixture (edited)"); await expect(personal).toBeVisible();
    const read = nextRpcResponse(page, "archive_saved_meal");
    await archiveRecipeFromCard(page, personal); const result = await read;
    expect(result.ok()).toBe(true); expect(result.request().postDataJSON().p_payload.mealId).not.toBe("meal-creamy-lemon-chicken");
    await expect(personal).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  } finally { await deleteLocalAccount(account); await context.close(); }
});

test("recipe library filters and image actions preserve browsing and meal-entry planning", async ({ browser }, info) => {
  test.setTimeout(240_000);
  const account = await createLocalAccount(`recipe-filters-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    await page.setViewportSize({ width: info.project.name === "mobile" ? 390 : 1440, height: 930 });
    await completeOnboarding(page, "Recipe Filters"); await openNutritionPage(page);
    const recipes = page.getByRole("region", { name: "Recipes", exact: true });
    const collection = recipes.getByRole("list", { name: "Recipe collection", exact: true });
    const cards = collection.locator(".recipe-card");
    const initialCount = await cards.count(); expect(initialCount).toBeGreaterThan(3);
    const beef = cards.filter({ has: page.getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true }) });
    const filter = recipes.getByRole("button", { name: "Filter recipes", exact: true });
    const create = recipes.getByRole("button", { name: "Create", exact: true });
    await expect(create).toHaveText("");
    expect(await filter.evaluate((button, next) => Boolean(button.compareDocumentPosition(next as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await create.elementHandle())).toBe(true);
    await filter.focus(); await page.keyboard.press("Tab"); await expect(create).toBeFocused();
    await expect(recipes.getByRole("tooltip", { name: "Create", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    const generate = page.getByRole("button", { name: "Generate", exact: true });
    await expect(generate).toHaveText("");
    const caloriePill = beef.getByRole("img", { name: "Approximately 560 calories per serving", exact: true });
    await expect(caloriePill).toHaveText("≈560 kcal"); await expect(caloriePill.locator("svg")).toHaveCount(0);
    for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
      const section = page.getByRole("region", { name: slot, exact: true });
      const add = section.getByRole("button", { name: "Add meal", exact: true });
      await expect(add).toHaveText(""); await expect(add).toHaveAttribute("id", `add-meal-${slot.toLowerCase()}`);
      await add.focus(); await expect(section.getByRole("tooltip", { name: `Add meal to ${slot}`, exact: true })).toBeVisible();
      await add.click(); await expect(add).toHaveAttribute("aria-expanded", "true");
      const entry = section.getByRole("group", { name: "Add meal", exact: true });
      const query = entry.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true });
      await query.fill(`Fixture ${slot} draft`);
      await entry.getByRole("button", { name: "Close", exact: true }).click(); await expect(add).toBeFocused();
      await add.click(); await expect(query).toHaveValue(`Fixture ${slot} draft`);
      await add.click(); await expect(entry).toHaveCount(0); await expect(add).toHaveAttribute("aria-expanded", "false");
    }
    const dialog = page.getByRole("dialog", { name: "Filter recipes", exact: true });
    await expect(recipes.getByRole("button", { name: "Add to plan", exact: true })).toHaveCount(0);
    await expect(recipes.getByRole("button", { name: /^Archive / })).toHaveCount(0);
    await expect(beef.locator(".border-t")).toHaveCount(0);
    await expect(recipes.getByRole("button", { name: "Create", exact: true })).toHaveClass(/bg-ink /);
    await recipes.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByRole("dialog", { name: "Create recipe", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
    await beef.getByRole("button", { name: "View recipe image: Korean Beef Bowl", exact: true }).click();
    await page.getByRole("dialog", { name: "Recipe overview", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
    const edit = beef.getByRole("button", { name: "Edit Korean Beef Bowl", exact: true });
    await beef.getByRole("button", { name: "View recipe image: Korean Beef Bowl", exact: true }).focus();
    await page.keyboard.press("Tab"); await expect(edit).toBeFocused();
    await expect(beef.getByRole("tooltip", { name: "Edit", exact: true })).toBeVisible();
    await page.keyboard.press("Escape"); await edit.click();
    await expect(page.getByRole("dialog", { name: "Recipe overview", exact: true })).toHaveCount(0);
    await page.getByRole("dialog", { name: "Edit recipe", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(edit).toBeFocused();
    await filter.click(); await expect(dialog.getByRole("searchbox", { name: "Recipe name" })).toBeFocused();
    await dialog.getByRole("searchbox", { name: "Recipe name" }).fill("korean beef");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(filter).toBeFocused(); await expect(cards).toHaveCount(initialCount);
    await filter.click(); await expect(dialog.getByRole("searchbox", { name: "Recipe name" })).toHaveValue("");
    await dialog.getByRole("searchbox", { name: "Recipe name" }).fill("KOREAN BEEF");
    await dialog.getByRole("checkbox", { name: "Default recipes", exact: true }).check();
    await dialog.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(cards).toHaveCount(1); await expect(recipes.getByText("2 active filter categories", { exact: true })).toHaveCount(1);
    await filter.click(); await dialog.getByRole("button", { name: "Reset", exact: true }).click();
    await page.keyboard.press("Escape"); await expect(cards).toHaveCount(1);
    await filter.click(); await expect(dialog.getByRole("searchbox", { name: "Recipe name" })).toHaveValue("KOREAN BEEF");
    await dialog.getByRole("button", { name: "Reset", exact: true }).click();
    await dialog.getByRole("checkbox", { name: "My recipes", exact: true }).check();
    await dialog.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(recipes.getByText("No recipes match these filters.", { exact: true })).toBeVisible();
    await recipes.getByRole("button", { name: "Clear filters", exact: true }).click(); await expect(cards).toHaveCount(initialCount);
    await filter.click();
    await dialog.getByRole("searchbox", { name: "Recipe name" }).fill("creamy lemon");
    await dialog.getByRole("checkbox", { name: "Lunch", exact: true }).check();
    await dialog.getByRole("combobox", { name: "Total cooking time", exact: true }).selectOption("30");
    await dialog.getByRole("checkbox", { name: "Easy", exact: true }).check();
    await dialog.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(cards).toHaveCount(1); await expect(cards.getByRole("button", { name: "View recipe: Creamy Lemon Chicken", exact: true })).toBeVisible();
    await filter.click(); await expect(dialog.getByRole("combobox", { name: "Total cooking time", exact: true })).toHaveValue("30");
    await dialog.getByRole("searchbox", { name: "Recipe name" }).fill("discard this edit");
    await dialog.getByRole("button", { name: "Close filter recipes", exact: true }).click();
    await filter.click(); await expect(dialog.getByRole("searchbox", { name: "Recipe name" })).toHaveValue("creamy lemon");
    await dialog.getByRole("button", { name: "Reset", exact: true }).click();
    await dialog.getByRole("button", { name: "Apply filters", exact: true }).click(); await expect(cards).toHaveCount(initialCount);
    const heart = beef.getByRole("button", { name: "Add to favorites: Korean Beef Bowl", exact: true });
    await expect(heart).toBeEnabled(); await heart.click();
    await expect(beef.getByRole("button", { name: "Remove from favorites: Korean Beef Bowl", exact: true })).toBeEnabled();
    await filter.click(); await dialog.getByRole("checkbox", { name: "Favorites only", exact: true }).check();
    await dialog.getByRole("button", { name: "Apply filters", exact: true }).click(); await expect(cards).toHaveCount(1);
    await page.route("**/rest/v1/rpc/get_recipe_card_metadata", route => route.fulfill({ status: 503, json: { message: "Favorites temporarily unavailable" } }));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(recipes.getByText(/Favorites filtering is unavailable/)).toBeVisible();
    await expect(recipes.getByText("No recipes match these filters.", { exact: true })).toHaveCount(0);
    await filter.click(); await expect(dialog.getByRole("checkbox", { name: "Favorites only", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.unroute("**/rest/v1/rpc/get_recipe_card_metadata"); await recipes.getByRole("button", { name: "Refresh cards", exact: true }).click();
    await expect(cards).toHaveCount(1); await recipes.getByRole("button", { name: "Clear filters", exact: true }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320, 367, 390, 398, 469, 570, 594, 760, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      await beef.scrollIntoViewIfNeeded();
      expect(await beef.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      for (const name of ["Edit Korean Beef Bowl"]) {
        const target = beef.getByRole("button", { name, exact: true });
        const box = await target.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
        const image = await beef.getByRole("button", { name: "View recipe image: Korean Beef Bowl", exact: true }).boundingBox();
        expect(box!.x).toBeGreaterThan(image!.x);
        expect(box!.x + box!.width).toBeLessThanOrEqual(image!.x + image!.width - 11);
        expect(image!.x + image!.width - box!.x - box!.width).toBeCloseTo(12, 0);
        expect(box!.y + box!.height).toBeLessThan(image!.y + image!.height);
        expect(await target.evaluate(node => getComputedStyle(node).backgroundColor)).toBe("rgb(255, 255, 255)");
      }
      await filter.click();
      if (width === 390 || width === 1440) await dialog.screenshot({ path: `output/recipe-filters/dialog-normal-${width}-${info.project.name}.png` });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await dialog.getByRole("button", { name: "Apply filters", exact: true }).scrollIntoViewIfNeeded();
      await expect(dialog.getByRole("button", { name: "Apply filters", exact: true })).toBeInViewport();
      if (width === 390 || width === 1440) await dialog.screenshot({ path: `output/recipe-filters/dialog-${width}-${info.project.name}.png` });
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await beef.scrollIntoViewIfNeeded(); expect(await beef.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      const resources = beef.getByRole("group", { name: "Recipe details", exact: true });
      if (width < 640) {
        await expect(resources.locator(":scope > span").first()).toHaveCSS("flex-wrap", "nowrap");
        await expect(resources).toHaveAttribute("tabindex", "0"); await expect(resources).toHaveAccessibleDescription("Scroll horizontally to view all recipe details.");
        await resources.focus(); await resources.press("ArrowRight");
        await expect.poll(() => resources.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
        await resources.evaluate(node => { node.scrollLeft = node.scrollWidth; });
        const last = resources.getByRole("img").last();
        const outerBox = await resources.boundingBox(), lastBox = await last.boundingBox();
        expect(lastBox!.x + lastBox!.width).toBeLessThanOrEqual(outerBox!.x + outerBox!.width + 1);
      } else {
        await expect(resources).not.toHaveAttribute("tabindex");
        await expect(resources.locator(":scope > span").first()).toHaveCSS("flex-wrap", "wrap");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      if (width === 390 || width === 1440) {
        await page.keyboard.press("Escape");
        await recipes.getByRole("heading", { name: "Recipes", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `output/recipe-filters/recipes-${width}-${info.project.name}.png` });
        await recipes.screenshot({ path: `output/recipe-filters/cards-${width}-${info.project.name}.png` });
      }
    }
    await archiveRecipeFromCard(page, beef); await expect(beef).toHaveCount(0);
    await page.reload(); await expect(page.getByRole("region", { name: "Recipes", exact: true }).getByText("0 active filter categories", { exact: true })).toHaveCount(1);
    expect(pageErrors).toEqual([]);
  } finally { await deleteLocalAccount(account); await context.close(); }
});

test("recipe card refinements preserve calorie basis, yield, icon controls and Medium defaults", async ({ page }, info) => {
  await openNutritionPage(page); await clearBrowserDrafts(page);
  const saved = page.getByRole("region", { name: "Recipes" });
  const row = saved.getByRole("listitem").filter({ has: page.getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true }) });
  await expect(row.getByText("≈560 kcal", { exact: true })).toBeVisible();
  await expect(row.getByRole("img", { name: "Recipe yields 4 servings", exact: true })).toBeVisible();
  await expect(row.getByRole("img", { name: "Approximately 560 calories per serving", exact: true })).toBeVisible();
  await expect(saved.getByRole("button", { name: "Duplicate", exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Add to plan", exact: true })).toHaveCount(0);
  const edit = row.getByRole("button", { name: "Edit Korean Beef Bowl", exact: true });
  await expect(row.getByRole("button", { name: /^Archive / })).toHaveCount(0);
  await row.getByRole("button", { name: "View recipe image: Korean Beef Bowl", exact: true }).focus(); await page.keyboard.press("Tab"); await expect(edit).toBeFocused();
  await expect(row.getByRole("tooltip", { name: "Edit", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(row.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Tab"); await expect(row.getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true })).toBeFocused();
  const editBox = await edit.boundingBox();
  expect(editBox!.width).toBeGreaterThanOrEqual(44); expect(editBox!.height).toBeGreaterThanOrEqual(44);
  await edit.click();
  const editDialog = page.getByRole("dialog", { name: "Edit recipe", exact: true });
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edit).toBeFocused();
  const planned = page.getByRole("region", { name: "Planned" });
  const initialPlannedRow = planned.getByRole("listitem").filter({ has: page.getByRole("button", { name: /^View recipe: / }) }).first();
  const plannedLogId = await initialPlannedRow.getByRole("button", { name: "Log", exact: true }).getAttribute("id");
  const plannedRow = planned.getByRole("listitem").filter({ has: page.locator(`[id="${plannedLogId}"]`) });
  await plannedRow.getByRole("button", { name: "Edit", exact: true }).click();
  const originalChoice = await plannedRow.getByRole("combobox", { name: "Planned meal choice", exact: true }).inputValue();
  const originalServings = await plannedRow.getByRole("spinbutton", { name: "Planned meal servings", exact: true }).inputValue();
  await plannedRow.getByRole("combobox", { name: "Planned meal choice", exact: true }).selectOption("meal:meal-korean-beef-bowl");
  await plannedRow.getByRole("spinbutton", { name: "Planned meal servings", exact: true }).fill("0.5");
  const planResponse = nextRpcResponse(page, "edit_meal_plan");
  await plannedRow.getByRole("button", { name: "Save meal", exact: true }).click();
  expect((await planResponse).ok()).toBe(true);
  await expect(plannedRow.getByRole("img", { name: "Recipe yields 4 servings", exact: true })).toHaveCount(0);
  await expect(plannedRow.getByText("≈280 kcal", { exact: true })).toBeVisible();
  await expect(row.getByText("≈560 kcal", { exact: true })).toBeVisible();
  await expect(plannedRow.getByText(/0.5 servings/)).toBeVisible();
  await plannedRow.getByRole("button", { name: "Log", exact: true }).click();
  await plannedRow.getByRole("spinbutton", { name: "Actual servings", exact: true }).fill("1.5");
  let plannedLogResponse = nextRpcResponse(page, "log_planned_meal");
  await plannedRow.getByRole("button", { name: "Confirm log", exact: true }).click();
  expect((await plannedLogResponse).ok()).toBe(true);
  const linkedId = plannedLogId!.replace(/^log-planned-/, "");
  const eaten = planned.getByRole("listitem").filter({ has: page.locator(`[data-planned-meal-id="${linkedId}"]`) });
  await expect(eaten.getByText("840 kcal", { exact: true })).toBeVisible();
  plannedLogResponse = nextRpcResponse(page, "delete_logged_meal");
  await eaten.getByRole("button", { name: "Delete Korean Beef Bowl", exact: true }).click();
  expect((await plannedLogResponse).ok()).toBe(true);
  await expect(plannedRow).toBeVisible();
  await plannedRow.getByRole("button", { name: "Edit", exact: true }).click();
  await plannedRow.getByRole("combobox", { name: "Planned meal choice", exact: true }).selectOption(originalChoice);
  await plannedRow.getByRole("spinbutton", { name: "Planned meal servings", exact: true }).fill(originalServings);
  const restoreResponse = nextRpcResponse(page, "edit_meal_plan");
  await plannedRow.getByRole("button", { name: "Save meal", exact: true }).click();
  expect((await restoreResponse).ok()).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await row.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await row.screenshot({ path: "output/recipe-card-refinements/card-" + info.project.name + ".png" });
  await saved.getByRole("button", { name: "Create", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create recipe", exact: true });
  await expect(editor.getByLabel("Complexity (required)", { exact: true })).toHaveValue("medium");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await saved.getByRole("button", { name: "Create", exact: true }).click();
  await expect(editor.getByText("Recipe draft restored.", { exact: true })).toHaveCount(0);
  await editor.getByLabel("Recipe name", { exact: true }).fill("Default Medium " + info.project.name);
  await editor.getByLabel("Recipe servings", { exact: true }).fill("3");
  await editor.getByRole("checkbox", { name: "Breakfast", exact: true }).check();
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await editor.getByLabel("Ingredient search").fill("eggs");
  await editor.getByRole("button", { name: /^Egg.*1 large egg/ }).click();
  await editor.getByLabel("Egg quantity", { exact: true }).fill("1");
  await fillRecipeSection(editor, "Instructions", "Instructions (required)", "Prepare and serve.");
  const saveResponse = nextRpcResponse(page, "save_recipe");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saveResponse).ok()).toBe(true);
  await page.reload();
  const created = saved.getByRole("listitem").filter({ has: page.getByRole("button", { name: "View recipe: Default Medium " + info.project.name, exact: true }) });
  await expect(created.getByText("Medium", { exact: true })).toBeVisible();
  await expect(created.getByRole("img", { name: "Recipe yields 3 servings", exact: true })).toBeVisible();
});

test("recipe controls step servings, suggest plural and close matches, and preserve method text", async ({ page }, info) => {
  const editor = await openRecipe(page);
  await expect(editor.getByPlaceholder("What should we call this recipe?", { exact: true })).toBeVisible();
  const servings = editor.getByLabel("Recipe servings", { exact: true });
  const minus = editor.getByRole("button", { name: "Decrease recipe servings" });
  const plus = editor.getByRole("button", { name: "Increase recipe servings" });
  await expect(minus).toBeDisabled();
  await plus.focus();
  await page.keyboard.press("Enter");
  await expect(servings).toHaveValue("1");
  await expect(minus).toBeDisabled();
  await servings.fill("1.5"); await expect(plus).toBeDisabled(); await expect(minus).toBeDisabled();
  await expect(servings).toHaveValue("1.5");
  await servings.fill("-1"); await expect(minus).toBeDisabled(); await expect(plus).toBeDisabled();
  await servings.fill("10000"); await expect(plus).toBeDisabled();
  await servings.fill("2");
  const query = editor.getByLabel("Ingredient search");
  await query.fill("eggs");
  await expect(editor.getByRole("button", { name: /^Egg.*1 large egg/ })).toBeVisible();
  await query.fill("chikcen");
  await expect(editor.getByRole("button", { name: /Chicken breast.*Close match/ })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Remove Chicken breast" })).toHaveCount(0);
  await query.fill("eggs");
  await editor.getByRole("button", { name: "Describe ingredients", exact: true }).click();
  await expect(editor.getByLabel("Ingredient description")).toHaveValue("eggs");
  await editor.getByLabel("Ingredient description").fill("Eggs and cooked rice");
  await editor.getByRole("button", { name: "Add custom ingredient", exact: true }).click();
  await expect(editor.getByLabel("Custom ingredient name")).toHaveValue("Eggs and cooked rice");
  await editor.getByLabel("Custom calories", { exact: true }).fill("0");
  await editor.getByRole("button", { name: "Search ingredients", exact: true }).click();
  await expect(query).toHaveValue("eggs");
  await editor.getByRole("button", { name: /^Egg.*1 large egg/ }).click();
  await editor.getByLabel("Egg quantity").fill("1.5");
  const remove = editor.getByRole("button", { name: "Remove Egg", exact: true });
  const unit = editor.getByLabel("Egg unit");
  await expect(unit.getByRole("option", { name: "piece/s", exact: true })).toHaveCount(1);
  await unit.selectOption("piece");
  const removeBounds = await remove.boundingBox(); const unitBounds = await unit.boundingBox();
  expect(removeBounds!.x).toBeGreaterThan(unitBounds!.x + unitBounds!.width);
  expect(Math.abs(removeBounds!.y + removeBounds!.height - unitBounds!.y - unitBounds!.height)).toBeLessThan(2);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true }).click();
  await editor.getByRole("button", { name: "Describe ingredients", exact: true }).click();
  await expect(editor.getByLabel("Ingredient description")).toHaveValue("Eggs and cooked rice");
  await editor.getByRole("button", { name: "Add custom ingredient", exact: true }).click();
  await expect(editor.getByLabel("Custom calories", { exact: true })).toHaveValue("0");
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await editor.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(query).toHaveValue("");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("nutrition food pickers offer plural and close matches without auto-selecting", async ({ page }) => {
  await openNutritionPage(page);
  await clearBrowserDrafts(page);
  await page.getByRole("region", { name: "Breakfast", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

  const query = page.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true });
  await query.fill("eggs");
  await expect(page.getByRole("button", { name: /^Egg.*1 large egg/ })).toBeVisible();
  await query.fill("chikcen");
  await expect(page.getByRole("button", { name: /Chicken breast.*Close match/ })).toBeVisible();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
});

test("recipe authoring saves custom nutrition, live totals, instructions and references", async ({ page }, info) => {
  const editor = await openRecipe(page);
  const name = `Recipe ${info.project.name} ${Date.now()}`;
  await expect(editor.getByPlaceholder("Servings", { exact: true })).toHaveValue("");
  await editor.getByLabel("Recipe name", { exact: true }).fill(name);
  await editor.getByLabel("Recipe servings", { exact: true }).fill("2");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await editor.getByRole("button", { name: "Add custom ingredient", exact: true }).click();
  await editor.getByLabel("Custom ingredient name").fill("Recipe test ingredient");
  await editor.getByLabel("Custom serving label").fill("100 g");
  await editor.getByLabel("Custom grams per serving").fill("100");
  for (const [metric,value] of [["calories","100"],["protein","10"],["carbs","20"],["fat","0"]]) await editor.getByLabel(`Custom ${metric}`, { exact: true }).fill(value);
  await editor.getByRole("button", { name: "Add custom ingredient to recipe" }).click();
  await expect(editor.getByPlaceholder("Quantity", { exact: true })).toHaveValue("");
  await editor.getByLabel("Recipe test ingredient measurement type").selectOption("range");
  await editor.getByLabel("Recipe test ingredient quantity", { exact: true }).fill("100");
  await editor.getByLabel("Recipe test ingredient upper quantity").fill("150");
  await editor.getByLabel("Recipe test ingredient unit").selectOption("tbsp");
  await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  const confirmation = editor.getByRole("region", { name: "Confirm conversion for Recipe test ingredient", exact: true });
  await confirmation.getByLabel("Recipe test ingredient conversion grams per tbsp", { exact: true }).fill("100");
  await expect(confirmation).toContainText("≈1–1.5 tbsp");
  await confirmation.getByRole("button", { name: "Confirm conversion", exact: true }).click();
  await expect(editor.getByLabel("Recipe test ingredient quantity", { exact: true })).toHaveValue("1");
  await editor.getByRole("tab", { name: "Details", exact: true }).click();
  const pills = editor.getByRole("group", { name: "Recipe nutrition per serving" });
  await expect(pills).toContainText("75 kcal");
  await expect(pills).toContainText("8 g protein");
  await expect(pills).toContainText("0 g fat");
  await editor.getByLabel("Recipe servings", { exact: true }).fill("3");
  await expect(pills).toContainText("50 kcal");
  await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await fillRecipeSection(editor, "Instructions", "Instructions (required)", "Mix the ingredients. Serve chilled.");
  await fillRecipeSection(editor, "Details", "Reference (optional)", "https://example.com/recipe");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true }).click();
  await expect(editor.getByText("Recipe draft restored.")).toBeVisible();
  await expect(pills).toContainText("50 kcal");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await expect(editor.getByLabel("Recipe test ingredient quantity", { exact: true })).toHaveValue("1");
  await expect(editor.getByLabel("Recipe test ingredient upper quantity")).toHaveValue("1.5");
  await expect(editor.getByLabel("Recipe test ingredient unit")).toHaveValue("tbsp");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).press("End");
  await expect(editor.getByRole("tab", { name: "Instructions", exact: true })).toBeFocused();
  await expect(editor.getByLabel("Instructions (required)")).toBeVisible();
  await editor.screenshot({ path: `test-results/recipe-${info.project.name}.png` });
  const response = nextRpcResponse(page, "save_recipe");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(editor).toHaveCount(0);
  const saved = page.getByRole("region", { name: "Recipes" }).getByRole("listitem").filter({ hasText: name }).first();
  await saved.getByRole("button", { name: `View recipe: ${name}`, exact: true }).click();
  const overview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
  await overview.getByRole("tab", { name: "Instructions", exact: true }).click();
  await expect(overview.getByText("Mix the ingredients. Serve chilled.")).toBeVisible();
  await overview.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(overview.getByRole("link", { name: "https://example.com/recipe" })).toHaveAttribute("rel", "noopener noreferrer");
  await overview.getByRole("button", { name: "Close", exact: true }).click();
  await saved.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit recipe", exact: true });
  await expect(edit.getByLabel("Recipe servings", { exact: true })).toHaveValue("3");
  await expect(edit.getByLabel("Instructions (required)")).toHaveValue("Mix the ingredients. Serve chilled.");
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(saved.getByRole("button", { name: "Duplicate", exact: true })).toHaveCount(0);
});

test("recipe authoring keeps the same retry key and recovers the full draft after failed saves", async ({ page }) => {
  let editor = await openRecipe(page);
  await editor.getByLabel("Recipe name", { exact: true }).fill(`Retry recipe ${Date.now()}`);
  await editor.getByLabel("Recipe servings", { exact: true }).fill("1");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await editor.getByLabel("Ingredient search").fill("Greek yogurt");
  await editor.getByRole("button", { name: /Greek yogurt.*170 g/ }).click();
  await editor.getByLabel("Greek yogurt quantity").fill("1");
  await fillRecipeSection(editor, "Instructions", "Instructions (required)", "Spoon into a bowl.");
  await fillRecipeSection(editor, "Details", "Reference (optional)", "Cookbook page 4");
  let firstKey = "";
  await page.route("**/rest/v1/rpc/save_recipe", route => {
    firstKey = route.request().postDataJSON().p_payload.idempotencyKey;
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Temporary test failure" }) });
  });
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.getByText(/Recipe was not saved/)).toBeVisible();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true }).click();
  editor = page.getByRole("dialog", { name: "Create recipe", exact: true });
  await expect(editor.getByText("Recipe draft restored.")).toBeVisible();
  await expect(editor.getByLabel("Reference (optional)")).toHaveValue("Cookbook page 4");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await expect(editor.getByLabel("Greek yogurt quantity")).toHaveValue("1");
  await page.unroute("**/rest/v1/rpc/save_recipe");
  const response = nextRpcResponse(page, "save_recipe");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  const savedResponse = await response;
  expect(savedResponse.request().postDataJSON().p_payload.idempotencyKey).toBe(firstKey);
  expect(savedResponse.ok()).toBe(true);
  await expect(editor).toHaveCount(0);
});

test("recipe authoring reviews AI suggestions, supported units and provider failure without losing ingredients", async ({ page }) => {
  const editor = await openRecipe(page);
  await editor.getByLabel("Recipe name", { exact: true }).fill("Review recipe");
  await editor.getByLabel("Recipe servings", { exact: true }).fill("2");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await editor.getByLabel("Ingredient search").fill("Greek yogurt");
  await editor.getByRole("button", { name: /Greek yogurt.*170 g/ }).click();
  await editor.getByLabel("Greek yogurt quantity").fill("1");
  await page.route("**/functions/v1/nutrition-text-parse", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestedMealName: "Bowl", candidates: [{ name: "Greek yogurt", quantity: 2, unit: "buckets", preparation: "prepared", assumptions: [], confidence: "high", presence: "stated" }, { name: "Honey", quantity: 1, unit: "serving", preparation: "prepared", assumptions: ["May be present"], confidence: "low", presence: "possible_hidden" }], questions: [] }) }));
  await page.route("**/functions/v1/nutrition-meal-match", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ matches: [] }) }));
  await editor.getByRole("button", { name: "Describe ingredients", exact: true }).click();
  await editor.getByLabel("Ingredient description").fill("yogurt with honey");
  await editor.getByRole("button", { name: "Analyze ingredients", exact: true }).click();
  const review = editor.getByRole("region", { name: "Ingredient review" });
  await expect(review.getByRole("button", { name: "Add selected ingredients" })).toBeDisabled();
  await expect(review.getByRole("checkbox", { name: "Honey", exact: true })).not.toBeChecked();
  await expect(review.getByLabel("Greek yogurt unit")).toHaveValue("g");
  expect(await review.getByLabel("Greek yogurt unit").locator("option").allTextContents()).toEqual(["g", "kg", "mg", "oz", "ml", "tsp", "tbsp", "cups", "piece/s"]);
  const conversion = review.getByRole("region", { name: "Confirm conversion for Greek yogurt", exact: true });
  await conversion.getByLabel("Greek yogurt conversion grams per buckets", { exact: true }).fill("170");
  await conversion.getByRole("button", { name: "Confirm conversion", exact: true }).click();
  await review.getByRole("button", { name: "Add selected ingredients" }).click();
  await expect(editor.getByRole("button", { name: "Remove Greek yogurt", exact: true })).toHaveCount(2);
  await expect(review.getByRole("checkbox", { name: "Greek yogurt", exact: true })).toHaveCount(0);
  await page.unroute("**/functions/v1/nutrition-text-parse");
  await page.route("**/functions/v1/nutrition-text-parse", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "provider_unavailable" }) }));
  await editor.getByRole("button", { name: "Analyze ingredients", exact: true }).click();
  await expect(editor.getByText(/Analysis is unavailable/)).toBeVisible();
  await expect(editor.getByRole("button", { name: "Remove Greek yogurt", exact: true })).toHaveCount(2);
  await editor.getByRole("button", { name: "Search ingredients", exact: true }).click();
  await editor.getByRole("button", { name: "Remove Greek yogurt", exact: true }).first().click();
  await editor.getByRole("button", { name: "Remove Greek yogurt", exact: true }).click();
  await expect(editor.getByRole("group", { name: "Recipe nutrition per serving" })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true }).click();
  await expect(editor.getByText("Recipe draft restored.")).toBeVisible();
  await editor.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(editor.getByLabel("Recipe name", { exact: true })).toHaveValue("");
  await expect(editor.getByLabel("Recipe servings", { exact: true })).toHaveValue("");
  await expect(editor.getByLabel("Ingredient description")).toHaveCount(0);
});

test("recipe authoring fills trusted search nutrition and retains input when search fails", async ({ page }) => {
  const editor = await openRecipe(page);
  await editor.getByLabel("Recipe servings", { exact: true }).fill("2");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await editor.getByLabel("Ingredient search").fill("Test lentils");
  await page.route("**/functions/v1/nutrition-search", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ fdcId: "recipe-test-lentils", recordType: "Foundation", name: "Test lentils", servingLabel: "100 g", servingGrams: 100, unit: "g", calories: 120, proteinG: 8, carbsG: 20, fatG: 0, nutrientsPer100g: { calories: 120, proteinG: 8, carbsG: 20, fatG: 0 }, source: "USDA FoodData Central", sourceVersion: "test", estimated: false, confidence: "high", preparationBasis: "cooked" }] }) }));
  await editor.getByRole("button", { name: "Search trusted USDA", exact: true }).click();
  await editor.getByRole("button", { name: /Test lentils.*USDA FoodData Central/ }).click();
  await expect(editor.getByText("100 g · cooked · USDA FoodData Central", { exact: true })).toHaveCount(0);
  await editor.getByLabel("Test lentils quantity").fill("150");
  await editor.getByLabel("Test lentils unit").selectOption("g");
  await editor.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(editor.getByRole("group", { name: "Recipe nutrition per serving" })).toContainText("90 kcal");
  await expect(editor.getByRole("region", { name: "Nutrition basis", exact: true })).toContainText("USDA FoodData Central");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await page.unroute("**/functions/v1/nutrition-search");
  await page.route("**/functions/v1/nutrition-search", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "provider_unavailable" }) }));
  await editor.getByLabel("Ingredient search").fill("Another ingredient");
  await editor.getByRole("button", { name: "Search trusted USDA", exact: true }).click();
  await expect(editor.getByText(/Trusted search is unavailable/)).toBeVisible();
  await expect(editor.getByLabel("Ingredient search")).toHaveValue("Another ingredient");
  await expect(editor.getByRole("button", { name: "Remove Test lentils", exact: true })).toBeVisible();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("recipe modal traps focus, scopes help dismissal and retains drafts across closing", async ({ page }, info) => {
  const editor = await openRecipe(page, false);
  const create = page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true });
  await expect(editor.getByLabel("Recipe name", { exact: true })).toBeFocused();
  await expect(editor).toHaveAttribute("aria-modal", "true");
  await expect(editor.getByRole("heading", { name: "Recipe basics", exact: true })).toHaveCount(0);
  await expect(editor.getByRole("region", { name: "Recipe basics", exact: true })).toBeVisible();
  await expect(editor.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(editor.getByRole("heading", { name: "Ingredients", exact: true })).not.toBeVisible();
  await editor.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(editor.getByRole("tabpanel", { name: "Details", exact: true })).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Reference (optional)", exact: true })).toBeVisible();
  await expect(editor.getByLabel("Time (mins.)", { exact: true })).toHaveValue("");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
  expect(await create.evaluate(node => Boolean(node.closest('[inert]')))).toBe(true);
  const cancel = editor.getByRole("button", { name: "Cancel", exact: true });
  await cancel.focus();
  await page.keyboard.press("Tab");
  await expect(editor.getByRole("button", { name: "About create recipe", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancel).toBeFocused();

  await editor.getByRole("button", { name: "About create recipe", exact: true }).click();
  const help = page.getByRole("dialog", { name: "Recipe authoring", exact: true });
  await expect(help).toBeVisible();
  await expect(help).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("button", { name: "About create recipe", exact: true })).toBeFocused();
  await editor.getByRole("button", { name: "About create recipe", exact: true }).click();
  await help.getByRole("button", { name: "Close Recipe authoring help" }).click();
  await expect(editor).toBeVisible();

  await editor.getByLabel("Recipe name", { exact: true }).fill("Retained modal draft");
  await editor.getByLabel("Time (mins.)", { exact: true }).fill("45");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(create).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe("hidden");
  await create.click();
  await expect(editor.getByLabel("Recipe name", { exact: true })).toHaveValue("Retained modal draft");
  await expect(editor.getByLabel("Time (mins.)", { exact: true })).toHaveValue("45");
  await expect(editor.getByLabel("Recipe name", { exact: true })).toBeFocused();
  await editor.getByRole("button", { name: "Close create recipe" }).click();
  await expect(create).toBeFocused();
  await create.click();
  if (info.project.name === "desktop") {
    await page.locator("[data-modal-backdrop]").click({ position: { x: 8, y: 8 } });
    await expect(editor).toHaveCount(0);
    await expect(create).toBeFocused();
    await create.click();
  }

  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await fillRecipeSection(editor, "Instructions", "Instructions (required)", "Long instructions. ".repeat(60));
  expect(await editor.evaluate(node => node.getBoundingClientRect().width <= innerWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(cancel).toBeInViewport();
  await expect(editor.getByRole("button", { name: "Close create recipe" })).toBeInViewport();
  if (info.project.name === "mobile") expect(await editor.evaluate(node => node.getBoundingClientRect().width)).toBeLessThanOrEqual(320);
  expect(await editor.locator("[data-modal-body]").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await editor.screenshot({ path: `test-results/recipe-modal-large-text-${info.project.name}.png` });
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await editor.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(editor.getByLabel("Recipe name", { exact: true })).toHaveValue("");
  await expect(editor.getByLabel("Time (mins.)", { exact: true })).toHaveValue("");
  await cancel.click();
  await create.click();
  await expect(editor.getByLabel("Recipe name", { exact: true })).toHaveValue("");
  await cancel.click();
});

test("recipe time validates, persists and clears through the modal", async ({ page }) => {
  const editor = await openRecipe(page);
  const name = `Timed recipe ${Date.now()}`;
  await editor.getByLabel("Recipe name", { exact: true }).fill(name);
  await editor.getByLabel("Recipe servings", { exact: true }).fill("2");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await editor.getByLabel("Ingredient search").fill("eggs");
  await editor.getByRole("button", { name: /^Egg.*1 large egg/ }).click();
  await editor.getByLabel("Egg quantity", { exact: true }).fill("1");
  await fillRecipeSection(editor, "Instructions", "Instructions (required)", "Prepare and serve.");
  await editor.getByRole("tab", { name: "Details", exact: true }).click();
  const time = editor.getByLabel("Time (mins.)", { exact: true });
  const save = editor.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeEnabled();
  for (const invalid of ["-1", "1.5", "2147483648"]) {
    await time.fill(invalid);
    await expect(time).toHaveAttribute("aria-invalid", "true");
    await expect(editor.getByRole("alert")).toContainText("Enter whole minutes");
    await expect(save).toBeDisabled();
  }
  await time.fill(""); await time.press("e");
  await expect(save).toBeDisabled();
  await time.fill("0"); await expect(save).toBeEnabled();
  let response = nextRpcResponse(page, "save_recipe");
  await save.click(); expect((await response).ok()).toBe(true);
  const savedRow = page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
  await expect(savedRow.getByText("0 mins", { exact: true })).toBeVisible();
  await savedRow.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit recipe", exact: true });
  await expect(edit.getByLabel("Recipe name", { exact: true })).toBeFocused();
  await expect(edit.getByLabel("Time (mins.)", { exact: true })).toHaveValue("0");
  await edit.getByLabel("Time (mins.)", { exact: true }).fill("45");
  response = nextRpcResponse(page, "save_recipe");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(savedRow.getByRole("button", { name: "Duplicate", exact: true })).toHaveCount(0);
  await savedRow.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await expect(edit.getByLabel("Recipe name", { exact: true })).toBeFocused();
  await edit.getByLabel("Time (mins.)", { exact: true }).fill("");
  response = nextRpcResponse(page, "save_recipe");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  const cleared = await response;
  expect(cleared.ok()).toBe(true);
  expect(cleared.request().postDataJSON().p_payload.meal.totalTimeMinutes).toBeNull();
  await expect(savedRow.getByText(/^\d+ mins$/)).toHaveCount(0);
});

test("recipe modal protects a pending save and shows stale-version recovery in the foreground", async ({ page }) => {
  const editor = await openRecipe(page);
  await editor.getByLabel("Recipe name", { exact: true }).fill("Conflict modal recipe");
  await editor.getByLabel("Time (mins.)", { exact: true }).fill("45");
  await editor.getByLabel("Recipe servings", { exact: true }).fill("1");
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
  await editor.getByLabel("Ingredient search").fill("Greek yogurt");
  await editor.getByRole("button", { name: /Greek yogurt.*170 g/ }).click();
  await editor.getByLabel("Greek yogurt quantity").fill("1");
  await fillRecipeSection(editor, "Instructions", "Instructions (required)", "Spoon into a bowl.");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/rest/v1/rpc/save_recipe", async route => {
    await gate;
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "stale_version" }) });
  });
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.getByText("Saving recipe…", { exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await expect(editor.getByRole("button", { name: "Close create recipe" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  release();
  await expect(editor.getByRole("alert")).toContainText("Your saved recipe or groceries changed");
  await expect(editor.getByRole("button", { name: "Use latest version" })).toBeVisible();
  await editor.getByRole("button", { name: "Use latest version" }).click();
  await expect(editor.getByRole("alert")).toHaveCount(0);
  await expect(editor.getByLabel("Instructions (required)")).toHaveValue("Spoon into a bowl.");
  await expect(editor.getByLabel("Time (mins.)", { exact: true })).toHaveValue("45");
  await page.unroute("**/rest/v1/rpc/save_recipe");
  const response = nextRpcResponse(page, "save_recipe");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Recipes" }).getByRole("button", { name: "Create", exact: true })).toBeFocused();
});

test("loads an existing account immediately after signing in from a fresh browser", async ({ browser }) => {
  const accounts = JSON.parse(fs.readFileSync("playwright/.auth/test-accounts.json", "utf8")) as LocalAccount[];
  const context = await browser.newContext({ serviceWorkers: "block", storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await page.goto("/auth/sign-in", { waitUntil: "domcontentloaded" });
    await page.getByRole("textbox", { name: "Email address" }).fill(accounts[0].email);
    await page.getByLabel("Password", { exact: true }).fill(accounts[0].password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`${new URL(baseURL).origin}/?$`));
    await expect(page.getByRole("heading", { name: "Hello, Fixture User A!" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today's meals" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Start onboarding" })).toHaveCount(0);

    await page.getByRole("link", { name: "Grocery", exact: true }).first().click();
    await expect(page.getByText("E2E Private Fixture A")).toBeVisible();
  } finally {
    await context.close();
  }
});

function nextRpcResponse(page: Page, rpc: string) {
  return page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes(`/rest/v1/rpc/${rpc}`),
  { timeout: 30_000 });
}

async function clearBrowserDrafts(page: Page) {
  await page.evaluate(async () => {
    window.localStorage.clear();
    if ("databases" in indexedDB) {
      const databases = await indexedDB.databases();
      await Promise.all(databases.map((database) => database.name
        ? new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(database.name!);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          })
        : Promise.resolve()));
    }
  });
}

async function openNutritionSlot(page: Page, slot: "Breakfast" | "Lunch" | "Dinner" | "Snack" = "Breakfast") {
  await page.goto("/nutrition");
  await expect(page.getByRole("region", { name: "Recipes" }).getByRole("listitem").first()).toBeVisible();
  await page.getByRole("region", { name: slot, exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

}

async function openNutritionPage(page: Page) {
  await page.goto("/nutrition");
  await expect(page.getByRole("region", { name: "Recipes" }).getByRole("listitem").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Add meal", exact: true }).first()).toBeEnabled();
}

async function changeDayAndReturn(page: Page) {
  const dayButtons = page.getByRole("group", { name: "Choose a day" }).getByRole("button");
  const selectedIndex = await dayButtons.evaluateAll((buttons) => buttons.findIndex((button) => button.getAttribute("aria-pressed") === "true"));
  expect(selectedIndex).toBeGreaterThanOrEqual(0);
  await dayButtons.nth(selectedIndex === 0 ? 1 : 0).click();
  await dayButtons.nth(selectedIndex).click();
}

async function mockMealProvider(page: Page, options: { includeEstimate?: boolean } = {}) {
  await page.route("**/functions/v1/nutrition-text-parse", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      suggestedMealName: "Fried Rice with 2 Eggs",
      candidates: [
        {
          name: "fried rice",
          quantity: 2,
          unit: "cups",
          preparation: "cooked",
          assumptions: ["Portion and oil amount are uncertain."],
          confidence: "medium",
          presence: "stated",
        },
        {
          name: "eggs",
          quantity: 2,
          unit: "large eggs",
          preparation: "fried",
          assumptions: [],
          confidence: "medium",
          presence: "stated",
        },
        {
          name: "cooking oil",
          quantity: 1,
          unit: "tbsp",
          preparation: "prepared",
          assumptions: ["A small amount of cooking oil may have been used."],
          confidence: "low",
          presence: "possible_hidden",
        },
      ],
      questions: ["How much oil was used?", "Were sauces added?"],
    }),
  }));
  await page.route("**/functions/v1/nutrition-meal-match", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ matches: [] }),
  }));
  if (options.includeEstimate) {
    await page.route("**/functions/v1/nutrition-macro-estimate", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        estimates: [{
          ingredientIndex: 0,
          name: "cooking oil",
          range: {
            calories: { low: 90, base: 110, high: 130 },
            proteinG: { low: 0, base: 0, high: 0 },
            carbsG: { low: 0, base: 0, high: 0 },
            fatG: { low: 10, base: 12, high: 14 },
          },
          assumptions: ["One tablespoon of oil was assumed."],
          modelRevision: "deepseek-flash",
          schemaRevision: "nutrition-macro-estimate-v1",
          valueSource: "ai_estimate",
          estimated: true,
          confidence: "low",
        }],
      }),
    }));
  }
}

async function completeOnboarding(page: Page, name: string) {
  await page.goto("/onboarding");
  await expect(page.getByText(/Onboarding · step 1 of/i)).toBeVisible();
  await page.getByLabel("What should we call you?").fill(name);
  await page.getByLabel("Age").fill("30");
  await page.getByText("None of the situations below apply to me", { exact: true }).click();
  await page.getByLabel("Height (cm)").fill("168");
  await page.getByLabel("Weight (kg)").fill("68");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText("Maintain weight", { exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: "Create my plan" }).click();
  await expect(page).toHaveURL(new RegExp(`${new URL(baseURL).origin}/?$`));
}

async function completeWorkout(page: Page) {
  await page.goto("/workouts");
  await page.getByRole("button", { name: /^Edit / }).first().click();
  await page.getByRole("textbox", { name: "Sets" }).first().fill("4");
  const overrideSaved = nextRpcResponse(page, "apply_workout_override");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  expect((await overrideSaved).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Remove edit" }).first()).toBeVisible({ timeout: 30_000 });
  const sessionLink = page.locator('a[href^="/workouts/session/"]').first();
  const sessionHref = await sessionLink.getAttribute("href");
  expect(sessionHref).toMatch(/^\/workouts\/session\//);
  const sessionStarted = nextRpcResponse(page, "start_workout_session");
  await sessionLink.click();
  expect((await sessionStarted).ok()).toBe(true);
  await expect(page).toHaveURL(new RegExp(`${sessionHref!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 30_000 });
  await expect(page.getByText(/Saving start workout session/)).toBeHidden({ timeout: 30_000 });

  for (let step = 0; step < 24; step += 1) {
    await expect(page.getByRole("group", { name: "Rate of perceived exertion" })).toBeVisible();
    const savedExercise = nextRpcResponse(page, "save_workout_session");
    await page.getByRole("group", { name: "Rate of perceived exertion" }).getByRole("button", { name: "5", exact: true }).click();
    expect((await savedExercise).ok()).toBe(true);
    await expect(page.getByText(/Saving save workout session/)).toBeHidden({ timeout: 30_000 });
    const finishButton = page.getByRole("button", { name: /Finish/ });
    if (await finishButton.isVisible()) {
      const workoutFinished = nextRpcResponse(page, "finish_workout_session");
      await page.getByRole("button", { name: /Finish/ }).click();
      expect((await workoutFinished).ok()).toBe(true);
      await expect(page).toHaveURL(/\/workouts$/, { timeout: 30_000 });
      return;
    }
    await page.getByRole("button", { name: "Next exercise" }).click();
  }
  throw new Error("Workout did not finish within the expected exercise bound.");
}

async function logEgg(page: Page) {
  await openNutritionSlot(page);
  await page.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." }).fill("egg");
  await page.getByRole("button", { name: /^Egg/ }).first().click();
  await expect(page.getByRole("group", { name: "Review food quantity" })).toBeVisible();
  await page.getByRole("group", { name: "Review food quantity" }).getByRole("button", { name: "Log meal" }).click();
  await expect(page.getByRole("region", { name: "Breakfast" }).getByRole("listitem").filter({ hasText: /Egg/ }).first()).toBeVisible();
  await expect(page.getByRole("group", { name: "Add meal" })).toHaveCount(0);
}

async function freshAccountJourney(browser: Browser, testInfo: import("@playwright/test").TestInfo) {
  const account: LocalAccount = await createLocalAccount(`journey-${testInfo.project.name}`);
  let context: BrowserContext | undefined;
  let journeyPage: Page | undefined;
  try {
    context = await createAuthenticatedContext(browser, baseURL, account);
    journeyPage = await context.newPage();
    await completeOnboarding(journeyPage, "Fresh Journey");
    await completeWorkout(journeyPage);
    await logEgg(journeyPage);

    await journeyPage.goto("/grocery");
    if (testInfo.project.name === "mobile") {
      await journeyPage.setViewportSize({ width: 342, height: 693 });
    }
    const customItem = `Journey item ${testInfo.project.name}`;
    const customItemField = journeyPage.getByRole("textbox", { name: "Extra grocery item name" });
    await customItemField.fill(customItem);
    await expect(customItemField).toHaveValue(customItem);
    if (testInfo.project.name === "mobile") {
      const fieldWidth = await customItemField.evaluate((element) => element.getBoundingClientRect().width);
      expect(fieldWidth).toBeGreaterThan(180);
      expect(await journeyPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
    await journeyPage.getByRole("button", { name: "Add custom grocery item" }).click();
    await expect(journeyPage.getByText(customItem)).toBeVisible();
    await journeyPage.getByRole("button", { name: `Edit quantity for ${customItem}` }).click();
    await journeyPage.getByRole("button", { name: `Increase ${customItem}` }).click();
    await journeyPage.getByRole("button", { name: `Save quantity for ${customItem}` }).click();
    await expect(journeyPage.getByText("adjusted by you")).toBeVisible();

    await journeyPage.goto("/progress");
    await expect(journeyPage.getByRole("heading", { name: "Recent history" })).toBeVisible();
    await expect(journeyPage.getByText(/completed/i).first()).toBeVisible();
    const historyList = journeyPage.getByRole("list", { name: "Recent history entries" });
    await expect(historyList).toContainText(/Egg · \d+ kcal/);
    await expect(historyList).not.toContainText(/review-food-[a-f0-9]{32}/i);
    if (testInfo.project.name === "mobile") {
      const historyRows = historyList.getByRole("listitem");
      const firstHistoryRow = historyRows.first();
      await expect(firstHistoryRow).toBeVisible();
      const rowLayout = await firstHistoryRow.evaluate((element) => ({
        itemWidth: element.getBoundingClientRect().width,
        listWidth: element.parentElement!.getBoundingClientRect().width,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        overflowX: getComputedStyle(element).overflowX,
      }));
      expect(rowLayout.itemWidth).toBeLessThanOrEqual(rowLayout.listWidth + 1);
      expect(rowLayout.overflowX).toBe("auto");
      expect(rowLayout.scrollWidth).toBeGreaterThan(rowLayout.clientWidth);
      expect(await journeyPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
  } catch (error) {
    if (journeyPage) {
      const diagnostic = `${journeyPage.url()}\n${await journeyPage.locator("body").innerText().catch(() => "Page text unavailable.")}`;
      await testInfo.attach("fresh-account-journey-state", { body: diagnostic, contentType: "text/plain" });
    }
    throw error;
  } finally {
    await context?.close();
    await deleteLocalAccount(account);
  }
}

test.describe("MVP-1 release browser gate", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Playwright starts each test on an opaque about:blank document. Navigate
    // to the app before touching browser storage so draft cleanup is reliable.
    await page.goto("/");
    await page.emulateMedia({ reducedMotion: testInfo.project.name === "mobile" ? "reduce" : "no-preference" });
    await clearBrowserDrafts(page);
  });

  test("covers the authenticated primary routes without horizontal overflow", async ({ page }) => {
    for (const route of ["/", "/workouts", "/nutrition", "/grocery", "/progress", "/settings"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${route} overflows its viewport`).toBe(false);
    }
  });

  test("keeps mobile bottom navigation anchored on Progress", async ({ page }, testInfo) => {
    const bottomNav = page.locator('nav[aria-label="Primary"]').last();
    if (testInfo.project.name !== "mobile") {
      await page.goto("/progress");
      await expect(page.getByRole("heading", { name: "Recent history" })).toBeVisible();
      await expect(bottomNav).toBeHidden();
      return;
    }

    await page.setViewportSize({ width: 342, height: 693 });
    await page.goto("/workouts");
    await expect(page.getByRole("heading", { name: "Workouts" })).toBeVisible();
    await expect(bottomNav).toBeVisible();
    const position = () => bottomNav.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const progressLink = element.querySelector('a[href="/progress"]')!.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        progressLeft: progressLink.left,
        progressRight: progressLink.right,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    const beforeNavigation = await position();
    expect(Math.abs((beforeNavigation.left + beforeNavigation.right) / 2 - beforeNavigation.viewportWidth / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(beforeNavigation.viewportHeight - beforeNavigation.bottom - 12)).toBeLessThanOrEqual(1);

    await bottomNav.getByRole("link", { name: "Progress" }).click();
    await expect(page).toHaveURL(/\/progress$/);
    await expect(page.getByRole("heading", { name: "Recent history" })).toBeVisible();
    const atTop = await position();
    expect(Math.abs(atTop.top - beforeNavigation.top)).toBeLessThanOrEqual(1);
    expect(Math.abs((atTop.left + atTop.right) / 2 - atTop.viewportWidth / 2)).toBeLessThanOrEqual(1);
    expect(atTop.left).toBeGreaterThanOrEqual(12);
    expect(atTop.right).toBeLessThanOrEqual(atTop.viewportWidth - 12);
    expect(atTop.progressLeft).toBeGreaterThanOrEqual(atTop.left);
    expect(atTop.progressRight).toBeLessThanOrEqual(atTop.viewportWidth - 12);
    expect(Math.abs(atTop.viewportHeight - atTop.bottom - 12)).toBeLessThanOrEqual(1);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const afterScroll = await position();
    expect(Math.abs(afterScroll.top - atTop.top)).toBeLessThanOrEqual(1);
    expect(Math.abs((afterScroll.left + afterScroll.right) / 2 - afterScroll.viewportWidth / 2)).toBeLessThanOrEqual(1);
    expect(afterScroll.left).toBeGreaterThanOrEqual(12);
    expect(afterScroll.right).toBeLessThanOrEqual(afterScroll.viewportWidth - 12);
    expect(afterScroll.progressRight).toBeLessThanOrEqual(afterScroll.viewportWidth - 12);
    expect(Math.abs(afterScroll.viewportHeight - afterScroll.bottom - 12)).toBeLessThanOrEqual(1);
  });

  test("requires quantity review and preserves input focus for a simple food", async ({ page }) => {
    await openNutritionSlot(page);
    const field = page.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." });
    await field.fill("e");
    await expect(field).toBeFocused();
    await field.type("gg");
    await expect(field).toHaveValue("egg");
    await expect(field).toBeFocused();
    await page.getByRole("button", { name: /^Egg/ }).first().click();
    await expect(page.getByRole("group", { name: "Review food quantity" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Review food quantity" }).getByRole("button", { name: "Log meal" })).toBeVisible();
  });

  test("shows consistent nutrition pills with valid quantity and manual previews", async ({ page }, testInfo) => {
    await openNutritionPage(page);
    const card = page.getByRole("region", { name: "Planned" });
    await page.getByRole("region", { name: "Snack", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

    await card.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." }).fill("egg");
    await card.getByRole("button", { name: /^Egg/ }).first().click();
    const review = card.getByRole("group", { name: "Review food quantity" });
    const preview = review.getByRole("group", { name: "Nutrition preview", exact: true });
    await expect(preview.locator("[data-nutrition-metric]")).toHaveCount(4);
    await expect(preview).toContainText("72 kcal");
    const expectedColors = { calories: "rgb(255, 171, 179)", proteinG: "rgb(170, 156, 224)", carbsG: "rgb(248, 211, 172)", fatG: "rgb(181, 226, 216)" };
    for (const [metric, color] of Object.entries(expectedColors)) {
      await expect(preview.locator(`[data-nutrition-metric="${metric}"]`)).toHaveCSS("background-color", color);
    }
    const initial = await preview.textContent();
    await review.getByRole("spinbutton", { name: "Quantity" }).fill("0.5");
    await expect(preview).toContainText("36 kcal");
    await review.getByRole("spinbutton", { name: "Quantity" }).fill("");
    await expect(preview).toHaveCount(0);
    await review.getByRole("spinbutton", { name: "Quantity" }).fill("1");
    await expect(preview).toHaveText(initial ?? "");
    const trackerColors = await page.getByRole("progressbar").evaluateAll((bars) => bars.map((bar) => getComputedStyle(bar.firstElementChild!).backgroundColor));
    expect(trackerColors).toEqual([expectedColors.proteinG, expectedColors.carbsG, expectedColors.fatG]);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    for (const pill of await preview.locator("[data-nutrition-metric]").all()) {
      expect(await pill.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await review.getByRole("spinbutton", { name: "Quantity" }).press("Tab");
    await expect(review.getByRole("combobox", { name: "Serving unit" })).toBeFocused();
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("nutrition-pills-large-text.png") });
    await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("nutrition-pills.png") });
    await review.getByRole("button", { name: "Cancel", exact: true }).click();
    await card.getByRole("tab", { name: "Enter manually" }).click();
    const manual = card.getByRole("group", { name: "Manual nutrition preview" });
    for (const label of ["kcal", "P g", "C g", "F g"]) await card.getByRole("textbox", { name: label, exact: true }).fill("0");
    await expect(manual).toContainText("0 kcal");
    await expect(manual).toContainText("0 g protein");
    await card.getByRole("textbox", { name: "P g", exact: true }).fill("");
    await expect(manual).toHaveCount(0);
  });

  test("combines planned and logged meals while keeping their actions distinct", async ({ page }) => {
    await page.goto("/nutrition");
    const dayCard = page.getByRole("region", { name: "Planned" });
    for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
      await expect(dayCard.getByRole("region", { name: slot })).toBeVisible();
    }
    await page.getByRole("region", { name: "Lunch", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();
    const logger = dayCard.getByRole("group", { name: "Add meal" });
    await expect(logger.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." })).toBeFocused();
    await expect(logger.getByRole("combobox", { name: "Meal slot" })).toHaveCount(0);

    await expect(logger.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." })).toBeVisible();
    await logger.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dayCard.getByRole("region", { name: "Lunch", exact: true }).getByRole("button", { name: "Add meal", exact: true })).toBeFocused();
  });

  test("keeps all meal slots usable at enlarged text", async ({ page }) => {
    await page.goto("/nutrition");
    await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
    const card = page.getByRole("region", { name: "Planned" });
    for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
      await expect(card.getByRole("region", { name: slot })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await card.getByRole("region", { name: "Breakfast", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();
    await expect(card.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." })).toBeFocused();
  });

  test("hides a logged planned breakfast and restores it after the last eaten entry is deleted", async ({ page }) => {
    await openNutritionPage(page);
    const breakfast = page.getByRole("region", { name: "Breakfast" });
    const plannedBefore = await breakfast.getByText(/^Planned(?: ·|$)/).count();
    const eatenBefore = await breakfast.getByText("Eaten", { exact: true }).count();
    const card = page.getByRole("region", { name: "Planned" });
    await page.getByRole("region", { name: "Breakfast", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

    await card.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." }).fill("egg");
    await card.getByRole("button", { name: /^Egg/ }).first().click();
    const saved = nextRpcResponse(page, "add_planned_meal");
    await card.getByRole("group", { name: "Review food quantity" }).getByRole("button", { name: "Add to plan" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(breakfast.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore + 1);
    await expect(breakfast.getByText("Eaten", { exact: true })).toHaveCount(eatenBefore);
    const newRow = breakfast.getByRole("list").first().getByRole("listitem").filter({ hasText: "Egg" }).last();
    await newRow.getByRole("button", { name: "Log", exact: true }).click();
    await newRow.getByRole("spinbutton", { name: "Actual servings" }).fill("2");
    const logged = nextRpcResponse(page, "log_planned_meal");
    await newRow.getByRole("button", { name: "Confirm log" }).click();
    expect((await logged).ok()).toBe(true);
    await expect(breakfast.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore);
    await expect(breakfast.getByText("Eaten", { exact: true })).toHaveCount(eatenBefore + 1);
    const firstEaten = breakfast.getByRole("listitem").filter({ hasText: "Egg ×2" }).last();
    await expect(firstEaten.getByRole("button", { name: "Edit Egg", exact: true })).toBeFocused();
    await expect(firstEaten.getByRole("button", { name: "Log again" })).toHaveCount(0);
    await firstEaten.getByRole("button", { name: "Edit Egg", exact: true }).click();
    const quantity = firstEaten.getByRole("spinbutton", { name: "Servings", exact: true });
    await quantity.fill("3");
    expect(await quantity.evaluate((input: HTMLInputElement) => input.validity.stepMismatch)).toBe(false);
    await quantity.press("ArrowUp");
    await expect(quantity).not.toHaveValue("3.01");
    await quantity.fill("1.5");
    const corrected = nextRpcResponse(page, "update_nutrition_log");
    await firstEaten.getByRole("button", { name: "Save correction", exact: true }).click();
    expect((await corrected).ok()).toBe(true);
    await expect(breakfast.getByText("Eaten", { exact: true })).toHaveCount(eatenBefore + 1);
    const correctedEaten = breakfast.getByRole("listitem").filter({ hasText: "Egg ×1.5" }).last();
    const firstDeleted = nextRpcResponse(page, "delete_nutrition_log");
    await correctedEaten.getByRole("button", { name: "Delete Egg" }).click();
    expect((await firstDeleted).ok()).toBe(true);
    await expect(breakfast.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore + 1);
    await expect(breakfast.getByText("Eaten", { exact: true })).toHaveCount(eatenBefore);
  });

  test("hides a planned recipe after grouped logging and restores it on deletion", async ({ page }) => {
    await openNutritionPage(page);
    const lunch = page.getByRole("region", { name: "Lunch" });
    const plannedBefore = await lunch.getByText(/^Planned(?: ·|$)/).count();
    const eatenBefore = await lunch.getByText("Eaten", { exact: true }).count();
    const recipeTitle = lunch.getByRole("button", { name: /^View recipe: / }).first();
    const recipeName = (await recipeTitle.getAttribute("aria-label"))!.replace("View recipe: ", "");
    const initialRecipeRow = lunch.getByRole("list").first().getByRole("listitem").filter({ has: page.getByRole("button", { name: `View recipe: ${recipeName}`, exact: true }) }).first();
    const plannedRecipeId = (await initialRecipeRow.getByRole("button", { name: "Log", exact: true }).getAttribute("id"))!.replace(/^log-planned-/, "");
    const plannedRecipe = lunch.getByRole("listitem").filter({ has: page.locator(`[id="log-planned-${plannedRecipeId}"]`) });
    await plannedRecipe.getByRole("button", { name: "Log", exact: true }).click();
    await plannedRecipe.getByRole("spinbutton", { name: "Actual servings" }).fill("1.25");
    const saved = nextRpcResponse(page, "log_planned_meal");
    await plannedRecipe.getByRole("button", { name: "Confirm log" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(lunch.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore - 1);
    await expect(lunch.getByText("Eaten", { exact: true })).toHaveCount(eatenBefore + 1);
    const eatenRecipe = lunch.getByRole("listitem").filter({ has: page.locator(`[data-planned-meal-id="${plannedRecipeId}"]`) });
    await expect(eatenRecipe.getByRole("button", { name: "Log again" })).toHaveCount(0);
    await eatenRecipe.getByRole("button", { name: `Edit ${recipeName}`, exact: true }).click();
    const correction = eatenRecipe.getByRole("group", { name: "Edit logged meal servings", exact: true });
    await expect(correction.getByRole("combobox")).toHaveCount(0);
    const ingredientQuantity = correction.getByRole("spinbutton", { name: "Recipe servings", exact: true });
    await ingredientQuantity.fill("3");
    expect(await ingredientQuantity.evaluate((input: HTMLInputElement) => input.validity.stepMismatch)).toBe(false);
    await ingredientQuantity.press("ArrowUp");
    await expect(ingredientQuantity).not.toHaveValue("3.01");
    await ingredientQuantity.fill("0.5");
    const corrected = nextRpcResponse(page, "update_logged_meal");
    await correction.getByRole("button", { name: "Save correction", exact: true }).click();
    expect((await corrected).ok()).toBe(true);
    await expect(correction).toHaveCount(0);
    await expect(lunch.getByText("Eaten", { exact: true })).toHaveCount(eatenBefore + 1);
    const deleted = nextRpcResponse(page, "delete_logged_meal");
    await eatenRecipe.getByRole("button", { name: `Delete ${recipeName}`, exact: true }).click();
    expect((await deleted).ok()).toBe(true);
    await expect(lunch.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore);
    await expect(lunch.getByText("Eaten", { exact: true })).toHaveCount(eatenBefore);
  });

  test("keeps a planned row when the same food is logged independently", async ({ page }) => {
    await openNutritionPage(page);
    const breakfast = page.getByRole("region", { name: "Breakfast" });
    const card = page.getByRole("region", { name: "Planned" });
    const plannedBefore = await breakfast.getByText(/^Planned(?: ·|$)/).count();
    await page.getByRole("region", { name: "Breakfast", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

    await card.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." }).fill("egg");
    await card.getByRole("button", { name: /^Egg/ }).first().click();
    const planned = nextRpcResponse(page, "add_planned_meal");
    await card.getByRole("group", { name: "Review food quantity" }).getByRole("button", { name: "Add to plan" }).click();
    expect((await planned).ok()).toBe(true);
    await expect(breakfast.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore + 1);
    await page.getByRole("region", { name: "Breakfast", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

    await card.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." }).fill("egg");
    await card.getByRole("button", { name: /^Egg/ }).first().click();
    const logged = nextRpcResponse(page, "save_nutrition_log");
    await card.getByRole("group", { name: "Review food quantity" }).getByRole("button", { name: "Log meal" }).click();
    expect((await logged).ok()).toBe(true);
    await expect(breakfast.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore + 1);
    const eatenEgg = breakfast.getByRole("listitem").filter({ hasText: "Egg ×1" }).last();
    await expect(eatenEgg.getByRole("button", { name: "Log again" })).toHaveCount(0);
  });

  test("keeps the planned confirmation open after a failed log for retry", async ({ page }) => {
    await openNutritionPage(page);
    const lunch = page.getByRole("region", { name: "Lunch" });
    const plannedBefore = await lunch.getByText(/^Planned(?: ·|$)/).count();
    const recipeTitle = lunch.getByRole("button", { name: /^View recipe: / }).first();
    const recipeName = (await recipeTitle.getAttribute("aria-label"))!.replace("View recipe: ", "");
    const initialRecipeRow = lunch.getByRole("list").first().getByRole("listitem").filter({ has: page.getByRole("button", { name: `View recipe: ${recipeName}`, exact: true }) }).first();
    const plannedRecipeId = (await initialRecipeRow.getByRole("button", { name: "Log", exact: true }).getAttribute("id"))!.replace(/^log-planned-/, "");
    const plannedRecipe = lunch.getByRole("listitem").filter({ has: page.locator(`[id="log-planned-${plannedRecipeId}"]`) });
    await plannedRecipe.getByRole("button", { name: "Log", exact: true }).click();
    await plannedRecipe.getByRole("spinbutton", { name: "Actual servings" }).fill("1.5");
    await page.route("**/rest/v1/rpc/log_planned_meal", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "temporary test failure" }) }));
    const failed = nextRpcResponse(page, "log_planned_meal");
    await plannedRecipe.getByRole("button", { name: "Confirm log" }).click();
    expect((await failed).ok()).toBe(false);
    await expect(plannedRecipe.getByRole("spinbutton", { name: "Actual servings" })).toHaveValue("1.5");
    await expect(lunch.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore);
    await page.unroute("**/rest/v1/rpc/log_planned_meal");
    const saved = nextRpcResponse(page, "log_planned_meal");
    await plannedRecipe.getByRole("button", { name: "Confirm log" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(lunch.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore - 1);
    const eatenRecipe = lunch.getByRole("listitem").filter({ has: page.locator(`[data-planned-meal-id="${plannedRecipeId}"]`) });
    const deleted = nextRpcResponse(page, "delete_logged_meal");
    await eatenRecipe.getByRole("button", { name: `Delete ${recipeName}`, exact: true }).click();
    expect((await deleted).ok()).toBe(true);
    await expect(lunch.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore);
  });

  test("replays a planned log when its saved response is lost", async ({ page }) => {
    await openNutritionPage(page);
    const lunch = page.getByRole("region", { name: "Lunch" });
    const eatenBefore = await lunch.getByText("Eaten", { exact: true }).count();
    const recipeTitle = lunch.getByRole("button", { name: /^View recipe: / }).first();
    const recipeName = (await recipeTitle.getAttribute("aria-label"))!.replace("View recipe: ", "");
    const initialRecipeRow = lunch.getByRole("list").first().getByRole("listitem").filter({ has: page.getByRole("button", { name: `View recipe: ${recipeName}`, exact: true }) }).first();
    const plannedRecipeId = (await initialRecipeRow.getByRole("button", { name: "Log", exact: true }).getAttribute("id"))!.replace(/^log-planned-/, "");
    const plannedRecipe = lunch.getByRole("listitem").filter({ has: page.locator(`[id="log-planned-${plannedRecipeId}"]`) });
    await plannedRecipe.getByRole("button", { name: "Log", exact: true }).click();
    await plannedRecipe.getByRole("spinbutton", { name: "Actual servings" }).fill("1.5");
    let serverSaved = false;
    await page.route("**/rest/v1/rpc/log_planned_meal", async (route) => {
      const response = await route.fetch();
      serverSaved = response.ok();
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "response lost after commit" }) });
    });
    const failed = nextRpcResponse(page, "log_planned_meal");
    await plannedRecipe.getByRole("button", { name: "Confirm log" }).click();
    expect((await failed).ok()).toBe(false);
    expect(serverSaved).toBe(true);
    await expect(plannedRecipe.getByRole("spinbutton", { name: "Actual servings" })).toHaveValue("1.5");
    await page.unroute("**/rest/v1/rpc/log_planned_meal");
    const replay = nextRpcResponse(page, "log_planned_meal");
    await plannedRecipe.getByRole("button", { name: "Confirm log" }).click();
    const replayed = await replay;
    expect(replayed.ok()).toBe(true);
    expect((await replayed.json()).replayed).toBe(true);
    await expect(lunch.getByText("Eaten", { exact: true })).toHaveCount(eatenBefore + 1);
    await expect(plannedRecipe.getByRole("button", { name: "Log", exact: true })).toHaveCount(0);
    const eatenRecipe = lunch.getByRole("listitem").filter({ has: page.locator(`[data-planned-meal-id="${plannedRecipeId}"]`) });
    const deleted = nextRpcResponse(page, "delete_logged_meal");
    await eatenRecipe.getByRole("button", { name: `Delete ${recipeName}`, exact: true }).click();
    expect((await deleted).ok()).toBe(true);
    await expect(plannedRecipe.getByRole("button", { name: "Log", exact: true })).toBeVisible();
  });

  test("adds a manually entered food to the plan without logging intake", async ({ page }) => {
    await openNutritionSlot(page, "Lunch");
    const lunch = page.getByRole("region", { name: "Lunch" });
    const eatenBefore = await lunch.getByText("Eaten", { exact: true }).count();
    const card = page.getByRole("group", { name: "Add meal" });
    await card.getByRole("tab", { name: "Enter manually" }).click();
    await card.getByRole("textbox", { name: "Custom food name" }).fill("Test lentil bowl");
    await card.getByRole("textbox", { name: "kcal" }).fill("240");
    await card.getByRole("textbox", { name: "P g" }).fill("14");
    await card.getByRole("textbox", { name: "C g" }).fill("32");
    await card.getByRole("textbox", { name: "F g" }).fill("6");
    const saved = nextRpcResponse(page, "add_planned_meal");
    await card.getByRole("button", { name: "Add to plan" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(lunch.getByText("Test lentil bowl", { exact: false })).toBeVisible();
    await expect(lunch.getByText("Eaten", { exact: true })).toHaveCount(eatenBefore);
  });

  test("retains a plan candidate after a failed save and day change", async ({ page }) => {
    await openNutritionSlot(page, "Breakfast");
    const card = page.getByRole("region", { name: "Planned" });
    await card.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." }).fill("egg");
    await card.getByRole("button", { name: /^Egg/ }).first().click();
    await card.getByRole("group", { name: "Review food quantity" }).getByRole("spinbutton", { name: "Quantity" }).fill("2");
    await page.route("**/rest/v1/rpc/add_planned_meal", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "temporary test failure" }) }));
    const failed = nextRpcResponse(page, "add_planned_meal");
    await card.getByRole("group", { name: "Review food quantity" }).getByRole("button", { name: "Add to plan" }).click();
    expect((await failed).ok()).toBe(false);
    await expect(card.getByRole("group", { name: "Review food quantity" }).getByRole("spinbutton", { name: "Quantity" })).toHaveValue("2");
    await changeDayAndReturn(page);
    await page.getByRole("region", { name: "Breakfast", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

    await expect(card.getByRole("group", { name: "Review food quantity" }).getByRole("spinbutton", { name: "Quantity" })).toHaveValue("2");
    await page.unroute("**/rest/v1/rpc/add_planned_meal");
    const saved = nextRpcResponse(page, "add_planned_meal");
    await card.getByRole("group", { name: "Review food quantity" }).getByRole("button", { name: "Add to plan" }).click();
    expect((await saved).ok()).toBe(true);
  });

  test("plans a reviewed description with a catalog match", async ({ page }) => {
    await openNutritionSlot(page, "Breakfast");
    await page.route("**/functions/v1/nutrition-text-parse", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ suggestedMealName: "Two eggs", candidates: [{ name: "egg", quantity: 2, unit: "piece", preparation: "cooked", assumptions: [], confidence: "medium", presence: "stated" }], questions: [] }),
    }));
    await page.route("**/functions/v1/nutrition-meal-match", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ matches: [] }) }));
    const card = page.getByRole("region", { name: "Planned" });
    await card.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." }).fill("egg with egg");
    await card.getByRole("button", { name: "Analyze this meal" }).click();
    const review = card.getByRole("region", { name: "Guided meal review" });
    await expect(review.getByRole("button", { name: "Add to plan" })).toBeEnabled();
    const saved = nextRpcResponse(page, "add_planned_meal");
    await review.getByRole("button", { name: "Add to plan" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(card.getByRole("region", { name: "Breakfast" }).getByText("Two eggs", { exact: false })).toBeVisible();
  });

  test("keeps logged food after a planned meal is skipped", async ({ page }) => {
    await logEgg(page);
    const dayCard = page.getByRole("region", { name: "Planned" });
    const breakfast = dayCard.getByRole("region", { name: "Breakfast" });
    const beforeCount = await breakfast.getByText("Eaten", { exact: true }).count();
    const firstPlanned = breakfast.getByRole("listitem").filter({ hasText: "Planned" }).first();
    const skip = firstPlanned.getByRole("button", { name: /^(Skip|Plan again)$/ });
    const changed = nextRpcResponse(page, "edit_meal_plan");
    await skip.click();
    expect((await changed).ok()).toBe(true);
    await expect(breakfast.getByText("Eaten", { exact: true })).toHaveCount(beforeCount);
    const eggRow = breakfast.getByRole("listitem").filter({ hasText: "Egg" }).last();
    await expect(eggRow).toBeVisible();
    await eggRow.getByRole("button", { name: /^Edit Egg/ }).click();
    await expect(eggRow.getByRole("group", { name: "Edit nutrition entry" })).toBeVisible();
    await eggRow.getByRole("button", { name: "Cancel" }).click();
  });

  test("keeps a manual meal draft after a failed save and day change", async ({ page }) => {
    await openNutritionSlot(page, "Snack");
    const dayCard = page.getByRole("region", { name: "Planned" });
    let logger = dayCard.getByRole("group", { name: "Add meal" });
    await logger.getByRole("tab", { name: "Enter manually" }).click();
    await logger.getByRole("textbox", { name: "Custom food name" }).fill("Manual retry meal");
    await logger.getByRole("textbox", { name: "kcal" }).fill("180");
    await logger.getByRole("textbox", { name: "P g" }).fill("10");
    await logger.getByRole("textbox", { name: "C g" }).fill("20");
    await logger.getByRole("textbox", { name: "F g" }).fill("5");
    await page.route("**/rest/v1/rpc/save_nutrition_log", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "temporary test failure" }) }));
    const failed = nextRpcResponse(page, "save_nutrition_log");
    await logger.getByRole("button", { name: "Log meal" }).click();
    expect((await failed).ok()).toBe(false);
    await expect(logger.getByRole("textbox", { name: "Custom food name" })).toHaveValue("Manual retry meal");
    await changeDayAndReturn(page);
    await page.getByRole("region", { name: "Snack", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();
    logger = dayCard.getByRole("group", { name: "Add meal" });

    await logger.getByRole("tab", { name: "Enter manually" }).click();
    await expect(logger.getByRole("textbox", { name: "Custom food name" })).toHaveValue("Manual retry meal");
    await page.unroute("**/rest/v1/rpc/save_nutrition_log");
    const saved = nextRpcResponse(page, "save_nutrition_log");
    await logger.getByRole("button", { name: "Log meal" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(dayCard.getByRole("region", { name: "Snack" }).getByText("Manual retry meal")).toBeVisible();
  });

  test("does not call DeepSeek until analysis is explicitly selected", async ({ page }) => {
    await openNutritionSlot(page, "Lunch");
    let extractionCalls = 0;
    await page.route("**/functions/v1/nutrition-text-parse", (route) => {
      extractionCalls += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestedMealName: "Fried Rice",
          candidates: [{
            name: "fried rice",
            quantity: 2,
            unit: "cups",
            preparation: "cooked",
            assumptions: [],
            confidence: "medium",
            presence: "stated",
          }],
          questions: [],
        }),
      });
    });
    await page.route("**/functions/v1/nutrition-meal-match", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ matches: [] }),
    }));
    const field = page.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." });
    await field.fill("2 cups fried rice with 2 eggs");
    await expect(page.getByText("Analyze sends your description to DeepSeek.", { exact: true })).toBeVisible();
    expect(extractionCalls).toBe(0);
    await page.getByRole("button", { name: "Analyze this meal" }).click();
    await expect(page.getByRole("region", { name: "Guided meal review" })).toBeVisible();
    expect(extractionCalls).toBe(1);
  });

  test("supports an explicit low-confidence AI estimate range", async ({ page }) => {
    await openNutritionSlot(page, "Dinner");
    await mockMealProvider(page, { includeEstimate: true });
    await page.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." }).fill("2 cups fried rice with 2 eggs");
    await page.getByRole("button", { name: "Analyze this meal" }).click();
    await expect(page.getByRole("region", { name: "Guided meal review" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Include cooking oil" }).check();
    await page.getByRole("button", { name: "Estimate selected unresolved" }).click();
    await expect(page.getByText(/AI estimate · low confidence · range 90–130 kcal/)).toBeVisible();
    await page.getByRole("button", { name: "About Meal review", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Meal review", exact: true }).getByText(/Catalog values are authoritative/i)).toBeVisible();
  });

  test("retains the meal description when the provider fails", async ({ page }) => {
    await openNutritionSlot(page, "Snack");
    await page.route("**/functions/v1/nutrition-text-parse", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "provider_unavailable" }),
    }));
    const description = "provider failure test meal";
    await page.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." }).fill(description);
    await page.getByRole("button", { name: "Analyze this meal" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Meal analysis is unavailable" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." })).toHaveValue(description);
    await expect(page.getByRole("button", { name: "Enter nutrition manually" })).toBeVisible();
  });

  test("verifies JSON and ZIP export contents through browser downloads", async ({ page }) => {
    await logEgg(page);
    await page.goto("/settings");
    const jsonPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const jsonDownload = await jsonPromise;
    expect(jsonDownload.suggestedFilename()).toMatch(/^cali-exercise-meal-planner-export-.*\.json$/);
    const jsonPath = await jsonDownload.path();
    expect(jsonPath).toBeTruthy();
    const jsonExport = JSON.parse(fs.readFileSync(jsonPath!, "utf8")) as { loggedMeals?: unknown };
    expect(jsonExport).toHaveProperty("loggedMeals");

    const zipPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV bundle" }).click();
    const zipDownload = await zipPromise;
    expect(zipDownload.suggestedFilename()).toMatch(/^cali-exercise-meal-planner-export-.*\.zip$/);
    const zipPath = await zipDownload.path();
    expect(zipPath).toBeTruthy();
    const files = unzipSync(fs.readFileSync(zipPath!));
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      "manifest.json",
      "export.json",
      "metadata.csv",
      "foods.csv",
      "loggedMeals.csv",
      "nutritionLogs.csv",
      "savedMeals.csv",
    ]));
    const manifest = JSON.parse(strFromU8(files["manifest.json"])) as { files?: string[] };
    expect(manifest.files).toEqual(expect.arrayContaining(["loggedMeals.csv", "nutritionLogs.csv"]));
    const nutritionHeaders = strFromU8(files["nutritionLogs.csv"])
      .split("\n", 1)[0]
      .split(",")
      .map((header) => header.replace(/^\uFEFF/, "").trim());
    expect(nutritionHeaders).toEqual(expect.arrayContaining(["app_id", "calories", "value_source", "estimate_range"]));
  });

  test("keeps a custom grocery draft through an offline failure and retries after reconnect", async ({ page, context }) => {
    await page.goto("/grocery");
    const name = `MVP offline item ${Date.now()}`;
    const nameField = page.getByRole("textbox", { name: "Extra grocery item name" });
    await nameField.fill(name);
    await context.setOffline(true);
    await page.getByRole("button", { name: "Add custom grocery item" }).click();
    await expect(nameField).toHaveValue(name);
    await expect(page.getByRole("status").filter({ hasText: /offline/i })).toBeVisible();
    await context.setOffline(false);
    await page.getByRole("button", { name: "Add custom grocery item" }).click();
    await expect(page.getByText(name)).toBeVisible();
    const removeButton = page.getByRole("button", { name: `Remove ${name}` });
    if (await removeButton.count()) {
      await removeButton.scrollIntoViewIfNeeded();
      await removeButton.click({ force: true });
    }
  });

  test("retains a stale draft when authoritative refresh fails", async ({ browser, page }) => {
    const secondContext = await browser.newContext({ storageState: userAState, serviceWorkers: "block" });
    const secondPage = await secondContext.newPage();
    try {
      await page.goto("/grocery");
      await secondPage.goto("/grocery");
      await page.getByRole("button", { name: /^Edit quantity for / }).first().click();
      await secondPage.getByRole("button", { name: /^Edit quantity for / }).first().click();
      const increase = page.getByRole("button", { name: /^Increase / }).first();
      const competingIncrease = secondPage.getByRole("button", { name: /^Increase / }).first();
      await increase.click();
      const firstEdit = nextRpcResponse(page, "set_grocery_quantity");
      await page.getByRole("button", { name: /^Save quantity for / }).first().click();
      await expect(page.getByText(/adjusted by you/i).first()).toBeVisible();
      expect((await firstEdit).ok()).toBe(true);

      await secondPage.route("**/rest/v1/**", (route) => {
        if (route.request().method() === "GET") return route.abort("failed");
        return route.continue();
      });
      await competingIncrease.click();
      await secondPage.getByRole("button", { name: /^Save quantity for / }).first().click();
      const conflictAlert = secondPage.getByRole("alert").filter({ hasText: /latest account data is not loaded yet/i });
      await expect(conflictAlert).toBeVisible();
      await secondPage.getByRole("button", { name: "Refresh data" }).click();
      await expect(conflictAlert).toBeVisible();
    } finally {
      await secondContext.close();
    }
  });

  test("keeps account data isolated between the two retained accounts", async ({ browser, page }) => {
    await page.goto("/grocery");
    await expect(page.getByText("E2E Private Fixture A")).toBeVisible();

    const userBContext: BrowserContext = await browser.newContext({ storageState: userBState, serviceWorkers: "block" });
    const userBPage = await userBContext.newPage();
    try {
      await userBPage.goto("/grocery");
      await expect(userBPage.getByText("E2E Private Fixture A")).not.toBeVisible();
      await expect(userBPage.getByRole("heading", { name: "Grocery" })).toBeVisible();
    } finally {
      await userBContext.close();
    }
  });

  test("keeps core controls usable with reduced motion and enlarged text", async ({ page }) => {
    await page.goto("/nutrition");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const visibleContentHeading = page.getByRole("heading", { name: "Nutrition" }).filter({ visible: true });
    if (test.info().project.name === "mobile") {
      // At 200% text the compact shell may collapse its route label to retain
      // the profile and notification controls; the page heading remains the
      // visible navigation anchor and must stay readable.
      await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    } else {
      await expect(visibleContentHeading).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });

  test("completes onboarding, plan edit, workout, nutrition, groceries, and progress for a fresh account", async ({ browser }, testInfo) => {
    await freshAccountJourney(browser, testInfo);
  });
});


test("meal entry uses slot controls and focuses isolated food reviews", async ({ page }, info) => {
  await openNutritionPage(page); await clearBrowserDrafts(page); await page.reload();
  const planned = page.getByRole("region", { name: "Planned", exact: true });
  const search = page.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true });
  const editor = planned.getByRole("group", { name: "Add meal", exact: true });
  const review = editor.getByRole("group", { name: "Review food quantity", exact: true });
  await expect(planned.getByRole("button", { name: "Add to plan", exact: true })).toHaveCount(0);
  for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
    const group = planned.getByRole("region", { name: slot, exact: true });
    const trigger = group.getByRole("button", { name: "Add meal", exact: true });
    await expect(trigger).toHaveCSS("min-height", "44px");
    await trigger.click();
    await expect(group.getByRole("group", { name: "Add meal", exact: true })).toBeVisible();
    await expect(search).toBeFocused();
    await expect(editor.getByRole("combobox", { name: "Meal slot" })).toHaveCount(0);
    await editor.getByRole("button", { name: "Close", exact: true }).click();
    await expect(trigger).toBeFocused();
  }
  await planned.getByRole("region", { name: "Breakfast", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();
  await search.fill("egg");
  await editor.getByRole("region", { name: "Food matches" }).getByRole("button", { name: /^Egg/ }).first().click();
  const quantity = review.getByRole("spinbutton", { name: "Quantity", exact: true });
  await expect(quantity).toBeFocused(); await quantity.fill("0.5");
  await expect(search).toHaveCount(0);
  await expect(editor.getByRole("region", { name: "Food matches" })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Search trusted USDA", exact: true })).toHaveCount(0);
  await expect(editor.getByRole("tablist", { name: "Entry type" })).toHaveCount(0);
  await expect(review).toContainText("Breakfast");
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(search).toHaveValue("egg"); await expect(search).toBeFocused();
  await expect(editor.getByRole("region", { name: "Food matches" })).toBeVisible();

  await page.route("**/functions/v1/nutrition-search", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ fdcId: "focused-test-lentils", recordType: "Foundation", name: "Focused test lentils", servingLabel: "100 g", servingGrams: 100, unit: "g", calories: 120, proteinG: 8, carbsG: 20, fatG: 0, nutrientsPer100g: { calories: 120, proteinG: 8, carbsG: 20, fatG: 0 }, source: "USDA FoodData Central", sourceVersion: "test", estimated: false, confidence: "high", preparationBasis: "cooked" }] }) }));
  await search.fill("focused lentils"); await editor.getByRole("button", { name: "Search trusted USDA", exact: true }).click();
  const providerResult = editor.getByRole("button", { name: /Focused test lentils.*USDA test/ });
  await providerResult.click(); await expect(quantity).toBeFocused(); await expect(search).toHaveCount(0);
  await expect(providerResult).toHaveCount(0);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(search).toHaveValue("focused lentils"); await expect(providerResult).toBeVisible();
  await page.unroute("**/functions/v1/nutrition-search");
  await page.route("**/functions/v1/nutrition-text-parse", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestedMealName: "Retained description", candidates: [{ name: "egg", quantity: 2, unit: "piece", preparation: "cooked", assumptions: [], confidence: "medium", presence: "stated" }], questions: [] }) }));
  await page.route("**/functions/v1/nutrition-meal-match", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ matches: [] }) }));
  await search.fill("egg with egg"); await editor.getByRole("button", { name: "Analyze this meal", exact: true }).click();
  const descriptionReview = editor.getByRole("region", { name: "Guided meal review", exact: true });
  await descriptionReview.getByRole("textbox", { name: "Meal name", exact: true }).fill("Keep my description review");
  await search.fill("egg"); await editor.getByRole("region", { name: "Food matches" }).getByRole("button", { name: /^Egg/ }).first().click();
  await expect(descriptionReview).toHaveCount(0);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(descriptionReview.getByRole("textbox", { name: "Meal name", exact: true })).toHaveValue("Keep my description review");
  await page.unroute("**/functions/v1/nutrition-text-parse"); await page.unroute("**/functions/v1/nutrition-meal-match");
  await search.fill("egg"); await editor.getByRole("region", { name: "Food matches" }).getByRole("button", { name: /^Egg/ }).first().click();
  await quantity.fill("2");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/rest/v1/rpc/add_planned_meal", async route => { await held; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "temporary failure" }) }); });
  const failed = nextRpcResponse(page, "add_planned_meal"); await review.getByRole("button", { name: "Add to plan", exact: true }).click();
  await expect(quantity).toBeDisabled();
  await expect(review.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  for (const trigger of await planned.getByRole("button", { name: "Add meal", exact: true }).all()) await expect(trigger).toBeDisabled();
  release(); expect((await failed).ok()).toBe(false);
  await expect(quantity).toHaveValue("2"); await expect(review.getByRole("alert")).toContainText("not confirmed");
  await page.unroute("**/rest/v1/rpc/add_planned_meal");
  await planned.getByRole("region", { name: "Lunch", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();
  await expect(review).toHaveCount(0); await search.fill("lunch draft");
  await planned.getByRole("region", { name: "Breakfast", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();
  await expect(quantity).toHaveValue("2"); await expect(quantity).toBeFocused();
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await editor.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await review.screenshot({ path: `output/recipe-card-refinements/slot-entry-review-${info.project.name}.png` });
});

test("saved recipe history edits whole meal servings and retains failed correction retries", async ({ page }, info) => {
  await openNutritionPage(page); await clearBrowserDrafts(page);
  const snack = page.getByRole("region", { name: "Snack", exact: true });
  const originalPlanned = await snack.getByText(/^Planned(?: ·|$)/).count();
  for (const name of ["Creamy Lemon Chicken", "Korean Beef Bowl"]) {
    await openNutritionSlot(page, "Snack");
    await page.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true }).fill(name);
    await page.getByRole("region", { name: "Saved recipes matches" }).getByRole("button", { name: new RegExp(name) }).click();
    const review = page.getByRole("group", { name: "Review recipe servings", exact: true });
    await review.getByLabel("Recipe servings", { exact: true }).fill("3");
    const logged = nextRpcResponse(page, "save_reviewed_meal");
    await review.getByRole("button", { name: "Log meal", exact: true }).click();
    expect((await logged).ok()).toBe(true);
    const row = snack.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Delete ${name}`, exact: true }) }).last();
    const edit = row.getByRole("button", { name: `Edit ${name}`, exact: true });
    await edit.click();
    const correction = row.getByRole("group", { name: "Edit logged meal servings", exact: true });
    const amount = correction.getByLabel("Recipe servings", { exact: true });
    await expect(amount).toBeFocused(); await expect(amount).toHaveValue("3");
    await expect(correction.getByRole("spinbutton")).toHaveCount(1);
    await expect(correction.getByRole("combobox")).toHaveCount(0);
    await amount.fill("2");
    await correction.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(edit).toBeFocused();
    await edit.click(); await expect(amount).toHaveValue("3");
    for (const invalid of ["", "0", "-1"]) {
      await amount.fill(invalid); await expect(correction.getByRole("button", { name: "Save correction", exact: true })).toBeDisabled();
    }
    await amount.fill("0.5");
    if (name === "Korean Beef Bowl") for (const text of ["≈280 kcal", "≈22.5 g protein", "≈29 g carbs", "≈8 g fat"]) await expect(correction.getByText(text, { exact: true })).toBeVisible();
    if (name === "Creamy Lemon Chicken") {
      let originalKey = "";
      await page.route("**/rest/v1/rpc/update_logged_meal", async route => {
        originalKey = route.request().postDataJSON().p_payload.idempotencyKey;
        const response = await route.fetch(); expect(response.ok()).toBe(true);
        await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "response lost after commit" }) });
      });
      const failed = nextRpcResponse(page, "update_logged_meal");
      await correction.getByRole("button", { name: "Save correction", exact: true }).click();
      expect((await failed).ok()).toBe(false);
      await expect(amount).toHaveValue("0.5");
      await expect(correction.getByText(/Could not save the serving change/)).toBeVisible();
      await page.unroute("**/rest/v1/rpc/update_logged_meal");
      const retry = nextRpcResponse(page, "update_logged_meal");
      await correction.getByRole("button", { name: "Save correction", exact: true }).click();
      const response = await retry; expect(response.ok()).toBe(true);
      expect(response.request().postDataJSON().p_payload.idempotencyKey).toBe(originalKey);
      expect((await response.json()).replayed).toBe(true);
    } else {
      if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      expect(await correction.evaluate(node => [node, ...node.querySelectorAll("*")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ tag: element.tagName, text: element.textContent?.slice(0, 60) })))).toEqual([]);
      await correction.screenshot({ path: `output/recipe-serving-correction/servings-editor-${info.project.name}.png` });
      await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
      const saved = nextRpcResponse(page, "update_logged_meal");
      await correction.getByRole("button", { name: "Save correction", exact: true }).click();
      expect((await saved).ok()).toBe(true);
    }
    await expect(correction).toHaveCount(0);
    await edit.click(); await expect(amount).toHaveValue("0.5");
    await correction.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(snack.getByText(/^Planned(?: ·|$)/)).toHaveCount(originalPlanned);
    const deleted = nextRpcResponse(page, "delete_logged_meal");
    await row.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
    expect((await deleted).ok()).toBe(true);
  }
});

test("saved recipe search offers direct portion review and restores date-slot drafts", async ({ page }, info) => {
  await openNutritionPage(page); await clearBrowserDrafts(page); await openNutritionSlot(page, "Dinner");
  const field = page.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true });
  let providerCalls = 0;
  page.on("request", request => { if (request.url().includes("/functions/v1/nutrition-")) providerCalls++; });
  await field.fill("creamy lemon chicken");
  const results = page.getByRole("region", { name: "Saved recipes matches" });
  await expect(results.getByRole("button", { name: /Creamy Lemon Chicken/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze this meal", exact: true })).toHaveCount(0);
  await results.getByRole("button", { name: /Creamy Lemon Chicken/ }).click();
  const review = page.getByRole("group", { name: "Review recipe servings", exact: true });
  const amount = review.getByRole("spinbutton", { name: "Recipe servings", exact: true });
  await expect(amount).toBeFocused(); await expect(amount).toHaveValue("1");
  await expect(field).toHaveCount(0);
  await expect(results).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Food matches" })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Entry type" })).toHaveCount(0);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(field).toHaveValue("creamy lemon chicken"); await expect(field).toBeFocused();
  await field.fill("chicken");
  await expect(page.getByRole("region", { name: "Food matches" })).toBeVisible();
  const groups = await page.getByRole("group", { name: "Add meal", exact: true }).locator("section[aria-label]").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
  expect(groups.slice(0, 2)).toEqual(["Saved recipes matches", "Food matches"]);
  await field.fill("korean beef bowl"); await results.getByRole("button", { name: /Korean Beef Bowl/ }).click();
  for (const invalid of ["", "0", "-1"]) { await amount.fill(invalid); await expect(review.getByRole("button", { name: "Log meal", exact: true })).toBeDisabled(); }
  await amount.fill("0.5");
  for (const text of ["≈280 kcal", "≈22.5 g protein", "≈29 g carbs", "≈8 g fat"]) await expect(review.getByText(text, { exact: true })).toBeVisible();
  await review.screenshot({ path: `output/recipe-card-refinements/slot-entry-recipe-review-${info.project.name}.png` });
  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open("calicoach-drafts");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const records = await new Promise<unknown[]>((resolve, reject) => { const read = db.transaction("drafts", "readonly").objectStore("drafts").getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
    db.close(); return JSON.stringify(records).includes('"servings":"0.5"');
  })).toBe(true);
  await page.reload();
  await page.getByRole("region", { name: "Dinner", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

  await expect(amount).toHaveValue("0.5"); await expect(review.getByText("≈280 kcal", { exact: true })).toBeVisible();
  await changeDayAndReturn(page);
  await page.getByRole("region", { name: "Dinner", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

  await expect(amount).toHaveValue("0.5");
  await page.getByRole("region", { name: "Snack", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();
  await expect(review).toHaveCount(0);
  await page.getByRole("region", { name: "Dinner", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();
  await expect(amount).toHaveValue("0.5");
  expect(providerCalls).toBe(0);
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const overflowingReviewElements = await review.evaluate(node => [node, ...node.querySelectorAll("*")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ tag: element.tagName, className: element.className, width: element.clientWidth, scrollWidth: element.scrollWidth, text: element.textContent?.slice(0, 80) })));
  expect(overflowingReviewElements).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" }); await amount.focus(); await page.keyboard.press("Tab");
});

test("saved recipe search logs once after a lost response and reload without consuming plans", async ({ page }) => {
  await openNutritionPage(page); await clearBrowserDrafts(page); await openNutritionSlot(page, "Lunch");
  const lunch = page.getByRole("region", { name: "Lunch", exact: true });
  const beforeEaten = await lunch.getByText("Eaten", { exact: true }).count();
  const beforePlanned = await lunch.getByText(/^Planned(?: ·|$)/).count();
  const field = page.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true });
  await field.fill("korean beef bowl"); await page.getByRole("region", { name: "Saved recipes matches" }).getByRole("button", { name: /Korean Beef Bowl/ }).click();
  const review = page.getByRole("group", { name: "Review recipe servings", exact: true });
  await review.getByLabel("Recipe servings", { exact: true }).fill("0.5");
  let committed = false; let firstKey = "";
  await page.route("**/rest/v1/rpc/save_reviewed_meal", async route => {
    firstKey = route.request().postDataJSON().p_payload.idempotencyKey;
    const response = await route.fetch(); committed = response.ok();
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "response lost after commit" }) });
  });
  const failed = nextRpcResponse(page, "save_reviewed_meal"); await review.getByRole("button", { name: "Log meal", exact: true }).click();
  expect((await failed).ok()).toBe(false); expect(committed).toBe(true);
  await expect(review.getByLabel("Recipe servings", { exact: true })).toHaveValue("0.5");
  await expect(review.getByText(/save was not confirmed/)).toBeVisible();
  await page.unroute("**/rest/v1/rpc/save_reviewed_meal"); await page.reload();
  await page.getByRole("region", { name: "Lunch", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

  await expect(review.getByLabel("Recipe servings", { exact: true })).toHaveValue("0.5");
  const replay = nextRpcResponse(page, "save_reviewed_meal"); await review.getByRole("button", { name: "Log meal", exact: true }).click();
  const response = await replay; expect(response.ok()).toBe(true); expect(response.request().postDataJSON().p_payload.idempotencyKey).toBe(firstKey);
  expect((await response.json()).replayed).toBe(true);
  await expect(review).toHaveCount(0); await expect(lunch.getByText("Eaten", { exact: true })).toHaveCount(beforeEaten + 1);
  await expect(lunch.getByText(/^Planned(?: ·|$)/)).toHaveCount(beforePlanned);
  const eaten = lunch.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Delete Korean Beef Bowl", exact: true }) }).last();
  await expect(eaten.getByText("280 kcal", { exact: true })).toBeVisible(); await expect(eaten.getByText("23 g protein", { exact: true })).toBeVisible(); // Existing Eaten summaries round for display; stored portion stays 22.5g.
  expect(response.request().postDataJSON().p_payload.ingredients[0]).toMatchObject({ servings: 0.5, calories: 560, proteinG: 45, carbsG: 58, fatG: 16 });
  const savedCard = page.getByRole("region", { name: "Recipes" }).getByRole("listitem").filter({ has: page.getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true }) });
  await expect(savedCard.getByText("≈560 kcal", { exact: true })).toBeVisible(); await expect(savedCard.getByRole("img", { name: "Recipe yields 4 servings", exact: true })).toBeVisible();
});

test("saved recipe search plans an existing portion and retains stable failed-save identity", async ({ page }) => {
  await openNutritionPage(page); await clearBrowserDrafts(page); await openNutritionSlot(page, "Dinner");
  const dinner = page.getByRole("region", { name: "Dinner", exact: true });
  const beforeEaten = await dinner.getByText("Eaten", { exact: true }).count(); const beforePlanned = await dinner.getByText(/^Planned(?: ·|$)/).count();
  await page.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true }).fill("korean beef bowl");
  await page.getByRole("region", { name: "Saved recipes matches" }).getByRole("button", { name: /Korean Beef Bowl/ }).click();
  const review = page.getByRole("group", { name: "Review recipe servings", exact: true }); await review.getByLabel("Recipe servings", { exact: true }).fill("0.5");
  let failedPayload: { idempotencyKey: string; plannedMeal: { id: string } };
  await page.route("**/rest/v1/rpc/add_planned_meal", route => { failedPayload = route.request().postDataJSON().p_payload; return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "temporary test failure" }) }); });
  const failed = nextRpcResponse(page, "add_planned_meal"); await review.getByRole("button", { name: "Add to plan", exact: true }).click(); expect((await failed).ok()).toBe(false);
  await expect(review.getByLabel("Recipe servings", { exact: true })).toHaveValue("0.5"); await expect(review.getByText(/save was not confirmed/)).toBeVisible();
  await page.unroute("**/rest/v1/rpc/add_planned_meal");
  const retry = nextRpcResponse(page, "add_planned_meal"); await review.getByRole("button", { name: "Add to plan", exact: true }).click(); const response = await retry;
  expect(response.ok()).toBe(true); const payload = response.request().postDataJSON().p_payload;
  expect(payload.idempotencyKey).toBe(failedPayload!.idempotencyKey); expect(payload.plannedMeal.id).toBe(failedPayload!.plannedMeal.id);
  expect(payload.plannedMeal.servings).toBe(0.5); expect(payload.newMeal).toBeUndefined();
  const planned = dinner.getByRole("listitem").filter({ has: page.locator(`[id="log-planned-${payload.plannedMeal.id}"]`) });
  await expect(planned.getByText("≈280 kcal", { exact: true })).toBeVisible();
  await expect(planned.getByText("source-provided", { exact: true })).toBeVisible();
  await planned.screenshot({ path: `output/recipe-card-refinements/planned-macros-row-${test.info().project.name}.png` });
  await expect(dinner.getByText(/^Planned(?: ·|$)/)).toHaveCount(beforePlanned + 1); await expect(dinner.getByText("Eaten", { exact: true })).toHaveCount(beforeEaten);
});


test("saved recipe search requires renewed review of stale or unavailable restored recipes", async ({ page }) => {
  await openNutritionPage(page); await clearBrowserDrafts(page); await openNutritionSlot(page, "Snack");
  await page.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true }).fill("korean beef bowl");
  await page.getByRole("region", { name: "Saved recipes matches" }).getByRole("button", { name: /Korean Beef Bowl/ }).click();
  const review = page.getByRole("group", { name: "Review recipe servings", exact: true }); await review.getByLabel("Recipe servings", { exact: true }).fill("0.5");
  async function alterRecoveredSelection(unavailable: boolean) {
    await expect.poll(async () => page.evaluate(async () => {
      const request = indexedDB.open("calicoach-drafts");
      const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
      const values = await new Promise<Array<{ value: { draftType: string; payload: { recipeSelection?: { servings: string } } } }>>(resolve => { const read = db.transaction("drafts", "readonly").objectStore("drafts").getAll(); read.onsuccess = () => resolve(read.result); });
      db.close(); return values.some(record => record.value.draftType.endsWith(":snack") && record.value.payload.recipeSelection?.servings === "0.5");
    })).toBe(true);
    await page.evaluate(async missing => {
      const request = indexedDB.open("calicoach-drafts");
      const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
      await new Promise<void>(resolve => {
        const tx = db.transaction("drafts", "readwrite"); const store = tx.objectStore("drafts"); const read = store.openCursor();
        read.onsuccess = () => { const cursor = read.result; if (!cursor) return; const record = cursor.value; const value = record.value ?? record;
          if (value.draftType.endsWith(":snack") && value.payload.recipeSelection) { value.payload.recipeSelection.token = "outdated review"; if (missing) value.payload.recipeSelection.id = "unavailable-recipe"; value.updatedAt = new Date().toISOString(); cursor.update(record); } cursor.continue(); };
        tx.oncomplete = () => resolve();
      }); db.close();
    }, unavailable);
    await page.reload(); await page.getByRole("region", { name: "Snack", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

  }
  await alterRecoveredSelection(false);
  await expect(review.getByLabel("Recipe servings", { exact: true })).toHaveValue("0.5");
  await expect(review.getByRole("button", { name: "Log meal", exact: true })).toBeDisabled();
  await review.getByRole("button", { name: "Review updated recipe", exact: true }).click();
  await expect(review.getByRole("button", { name: "Log meal", exact: true })).toBeEnabled();
  await alterRecoveredSelection(true);
  await expect(review.getByLabel("Recipe servings", { exact: true })).toHaveValue("0.5");
  await expect(review.getByText(/archived or unavailable/)).toBeVisible();
  await expect(review.getByRole("button", { name: "Log meal", exact: true })).toBeDisabled();
  await expect(review.getByRole("button", { name: "Refresh recipes", exact: true })).toBeVisible();
});

test("daily Planned and Eaten summaries keep editable weeks independent", async ({ browser }, info) => {
  const account = await createLocalAccount(`nutrition-weeks-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, baseURL, account);
  const page = await context.newPage();
  await page.setViewportSize({ width: info.project.name === "mobile" ? 320 : 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  try {
    await completeOnboarding(page, "Nutrition Weeks"); await openNutritionPage(page);
    const mode = page.getByRole("group", { name: "Nutrition summary view" });
    const navigation = page.getByRole("group", { name: "Choose a nutrition week", exact: true });
    await expect(navigation.getByRole("group", { name: "Nutrition summary view", exact: true })).toBeVisible();
    const modeBox = await mode.boundingBox();
    const todayBox = await navigation.getByRole("button", { name: "Today", exact: true }).boundingBox();
    const previousBox = (await navigation.getByRole("button", { name: "Previous week", exact: true }).boundingBox())!;
    const nextBox = (await navigation.getByRole("button", { name: "Next week", exact: true }).boundingBox())!;
    expect(previousBox.x + previousBox.width).toBeLessThanOrEqual(todayBox!.x + 1);
    expect(todayBox!.x + todayBox!.width).toBeLessThanOrEqual(nextBox.x + 1);
    expect(modeBox!.y).toBeGreaterThanOrEqual(todayBox!.y);
    const toolbarHeights = await navigation.getByRole("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    expect(toolbarHeights).toHaveLength(5);
    for (const height of toolbarHeights) expect(height).toBeCloseTo(44, 1);
    expect(modeBox!.height).toBeCloseTo(44, 1);
    await expect(mode.getByRole("button", { name: "Eaten", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("No meals eaten", { exact: true })).toBeVisible();
    for (const metric of ["Protein", "Carbs", "Fat"]) {
      const track = page.getByRole("progressbar", { name: metric, exact: true });
      await expect(track).toBeVisible(); await expect(track).not.toHaveAttribute("aria-valuenow");
      await expect(track).toHaveAttribute("aria-valuetext", "No entry logged");
      expect(await track.locator("div").evaluate(node => node.getBoundingClientRect().width)).toBe(0);
    }
    await page.screenshot({ path: `output/restricted-recipe-units/empty-summary-${info.project.name}.png` });
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add meal", exact: true }).first()).toBeEnabled();
    await mode.getByRole("button", { name: "Planned", exact: true }).click();
    await expect(page.getByText("No meals planned.", { exact: true })).toBeVisible();
    async function addBeef() {
      await page.getByRole("region", { name: "Lunch", exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();
      await page.getByLabel("Search foods or saved recipes, or describe a meal.", { exact: true }).fill("korean beef bowl");
      await page.getByRole("region", { name: "Saved recipes matches" }).getByRole("button", { name: /Korean Beef Bowl/ }).click();
      const review = page.getByRole("group", { name: "Review recipe servings", exact: true });
      await review.getByLabel("Recipe servings", { exact: true }).fill("0.5");
      let releaseSave!: () => void;
      const saveHeld = new Promise<void>(resolve => { releaseSave = resolve; });
      const holdSave = async (route: Route) => { await saveHeld; await route.continue(); };
      await page.route("**/rest/v1/rpc/add_planned_meal", holdSave);
      const response = nextRpcResponse(page, "add_planned_meal");
      await review.getByRole("button", { name: "Add to plan", exact: true }).click();
      try {
        for (const name of ["Previous week", "Next week", "Today"]) await expect(navigation.getByRole("button", { name, exact: true })).toBeDisabled();
      } finally {
        releaseSave();
        await response;
        await page.unroute("**/rest/v1/rpc/add_planned_meal", holdSave);
      }
      expect((await response).ok()).toBe(true); await expect(review).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Add meal", exact: true }).first()).toBeEnabled();
    }
    const summary = page.getByRole("region", { name: "Planned daily nutrition", exact: true });
    const lunch = page.getByRole("region", { name: "Lunch", exact: true });
    await addBeef();
    await expect(summary.getByText("280 kcal planned", { exact: false })).toBeVisible();
    await expect(summary.getByText(/22\.5 g/)).toBeVisible();
    await expect(summary.getByRole("img", { name: /planned calories remaining/ })).toBeVisible();
    await expect(summary.getByText("kcal to target", { exact: true })).toBeVisible();
    await expect(summary.getByRole("progressbar")).toHaveCount(3);
    await lunch.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(page.getByText("No active meals planned.", { exact: true })).toBeVisible();
    await lunch.getByRole("button", { name: "Plan again", exact: true }).click();
    await expect(summary.getByText(/280 kcal planned/)).toBeVisible();
    await lunch.getByRole("button", { name: "Edit", exact: true }).click();
    await lunch.getByLabel("Planned meal servings", { exact: true }).fill("1");
    await lunch.getByRole("button", { name: "Save meal", exact: true }).click();
    await expect(summary.getByText(/560 kcal planned/)).toBeVisible();
    await lunch.getByRole("button", { name: "Edit", exact: true }).click();
    await lunch.getByLabel("Planned meal servings", { exact: true }).fill("0.5");
    await lunch.getByRole("button", { name: "Save meal", exact: true }).click();
    await expect(summary.getByText(/280 kcal planned/)).toBeVisible();
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(page.getByText("No meals planned.", { exact: true })).toBeVisible();
    await addBeef();
    await page.getByRole("button", { name: "Previous week", exact: true }).click();
    await expect(summary.getByText(/280 kcal planned/)).toBeVisible();
    await lunch.getByRole("button", { name: "Log", exact: true }).click();
    await lunch.getByRole("button", { name: "Confirm log", exact: true }).click();
    await expect(lunch.getByRole("button", { name: "Delete Korean Beef Bowl", exact: true })).toBeVisible();
    await expect(summary.getByText(/280 kcal planned/)).toBeVisible();
    await mode.getByRole("button", { name: "Eaten", exact: true }).click();
    await expect(page.getByText(/Logged: 280 kcal/)).toBeVisible();
    await expect(page.getByText("1 meal eaten", { exact: true })).toBeVisible();
    const snack = page.getByRole("region", { name: "Snack", exact: true });
    await snack.getByRole("button", { name: "Add meal", exact: true }).click();
    await snack.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal." }).fill("egg");
    await snack.getByRole("button", { name: /^Egg/ }).first().click();
    const independentLog = nextRpcResponse(page, "save_nutrition_log");
    await snack.getByRole("group", { name: "Review food quantity" }).getByRole("button", { name: "Log meal", exact: true }).click();
    expect((await independentLog).ok()).toBe(true);
    await expect(page.getByText("2 meals eaten", { exact: true })).toBeVisible();
    const deletedFood = nextRpcResponse(page, "delete_nutrition_log");
    await snack.getByRole("button", { name: "Delete Egg", exact: true }).click();
    expect((await deletedFood).ok()).toBe(true);
    await expect(page.getByText("1 meal eaten", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log again", exact: true })).toHaveCount(0);
    await mode.getByRole("button", { name: "Planned", exact: true }).click();
    await summary.locator("..").screenshot({ path: `output/nutrition-week/summary-normal-${info.project.name}.png` });
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await expect.poll(async () => navigation.getByRole("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height))).toEqual([88, 88, 88, 88, 88]);
    const enlargedModeHeight = (await mode.boundingBox())!.height;
    expect([88, 176]).toContain(enlargedModeHeight);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(info.project.name === "mobile" ? 321 : 1441);
    await page.screenshot({ path: `output/nutrition-week/summary-${info.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(summary.getByText(/280 kcal planned/)).toBeVisible();
    await expect(lunch.getByRole("button", { name: "Log", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add meal", exact: true }).first()).toBeEnabled();
    await page.reload();
    await expect(mode.getByRole("button", { name: "Eaten", exact: true })).toHaveAttribute("aria-pressed", "true");
  } finally { try { await context.close(); } finally { await deleteLocalAccount(account); } }
});

test("compact nutrition toolbar keeps equal heights and accessible navigation across year boundaries", async ({ page }, info) => {
  await openNutritionPage(page);
  await page.setViewportSize({ width: info.project.name === "mobile" ? 320 : 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const navigation = page.getByRole("group", { name: "Choose a nutrition week", exact: true });
  const previous = navigation.getByRole("button", { name: "Previous week", exact: true });
  const next = navigation.getByRole("button", { name: "Next week", exact: true });
  const mode = navigation.getByRole("group", { name: "Nutrition summary view", exact: true });
  const today = navigation.getByRole("button", { name: "Today", exact: true });
  for (const button of [previous, next]) {
    const bounds = await button.boundingBox();
    expect(bounds!.width).toBeCloseTo(44, 1); expect(bounds!.height).toBeCloseTo(44, 1);
  }
  const saved = page.getByRole("region", { name: "Recipes", exact: true });
  const archive = saved.getByRole("button", { name: /^Archive / }).first();
  expect((await archive.boundingBox())!.height).toBeCloseTo(48, 1);
  await previous.focus();
  await expect(page.getByRole("tooltip", { name: "Previous week", exact: true })).toBeVisible();
  await previous.press("Escape");
  await expect(page.getByRole("tooltip", { name: "Previous week", exact: true })).toHaveCount(0);
  await previous.press("Tab"); await expect(today).toBeFocused();
  await today.press("Tab"); await expect(next).toBeFocused();
  await next.press("Tab"); await expect(mode.getByRole("button", { name: "Planned", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(mode.getByRole("button", { name: "Eaten", exact: true })).toBeFocused();
  const range = page.locator("#nutrition-week-range");
  await expect(range).toHaveClass(/sr-only/);
  const originalRange = await range.textContent();
  await expect(navigation).toHaveAccessibleDescription(originalRange!);
  await previous.click(); await expect(range).not.toHaveText(originalRange!);
  await today.click(); await expect(range).toHaveText(originalRange!);
  const year = Number(todayKey().slice(0, 4));
  const boundary = startOfWeek(`${year}-12-31`);
  const steps = Math.round((Date.parse(boundary) - Date.parse(startOfWeek(todayKey()))) / (7 * 86400000));
  for (let index = 0; index < steps; index++) await next.click();
  await expect(navigation).toContainText(addDays(boundary, 6).slice(0, 4));
  const days = page.getByRole("group", { name: "Choose a day", exact: true });
  const finalDay = addDays(boundary, 6);
  await expect(days.getByRole("button", { name: formatFullDate(finalDay), exact: true })).toContainText(fromKey(finalDay).toLocaleDateString("en-US", { month: "short" }));
  const monthLabels = await days.getByRole("button").evaluateAll(buttons => buttons.map(button => button.lastElementChild!.textContent));
  const dayWeights = await days.getByRole("button").evaluateAll(buttons => buttons.map(button => [...button.children].map(label => getComputedStyle(label).fontWeight)));
  for (const weights of dayWeights) expect(weights).toEqual(["400", "800", "400"]);
  expect(monthLabels).toEqual(Array.from({ length: 7 }, (_, index) => fromKey(addDays(boundary, index)).toLocaleDateString("en-US", { month: "short" })));
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect.poll(async () => navigation.getByRole("button").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height))).toEqual([88, 88, 88, 88, 88]);
  expect([88, 176]).toContain((await mode.boundingBox())!.height);
  await expect(range).toHaveClass(/sr-only/);
  for (const button of await mode.getByRole("button").all()) expect(await button.evaluate(element => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(info.project.name === "mobile" ? 321 : 1441);
  await navigation.screenshot({ path: `output/nutrition-week/compact-toolbar-${info.project.name}.png` });
  await today.click();
  await expect(page.getByRole("button", { name: "Add meal", exact: true }).first()).toBeEnabled();
  await page.evaluate(() => { document.documentElement.style.fontSize = "100%"; });
  const todayPage = days.locator('button[aria-current="date"]');
  await expect(todayPage).toHaveAttribute("aria-pressed", "true");
  const selectedColors = await todayPage.evaluate(button => ({ paper: getComputedStyle(button).backgroundColor, header: getComputedStyle(button.firstElementChild!).backgroundColor, border: getComputedStyle(button).borderTopColor }));
  expect(selectedColors).toEqual({ paper: "rgb(255, 255, 255)", header: "rgb(38, 40, 54)", border: "rgb(38, 40, 54)" });
  const inactiveLabel = (await days.locator('button[aria-pressed="false"]').first().getAttribute("aria-label"))!;
  const unselectedPage = days.getByRole("button", { name: inactiveLabel, exact: true });
  const inactiveHeader = await unselectedPage.evaluate(button => getComputedStyle(button.firstElementChild!).backgroundColor);
  expect(inactiveHeader).toBe("rgb(249, 221, 224)");
  await unselectedPage.hover();
  expect(await unselectedPage.evaluate(button => getComputedStyle(button.firstElementChild!).backgroundColor)).toBe(info.project.name === "mobile" ? "rgb(249, 221, 224)" : "rgb(244, 198, 204)");
  await unselectedPage.click();
  await expect(unselectedPage).toHaveAttribute("aria-pressed", "true");
  await expect(todayPage).toHaveAttribute("aria-pressed", "false");
  await expect(todayPage.locator("span.bg-lav-100")).toBeVisible();
  await unselectedPage.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(unselectedPage).toBeFocused();
  expect(await unselectedPage.evaluate(button => getComputedStyle(button).outlineStyle)).toBe("solid");
  const pagesFit = await days.getByRole("button").evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().width >= 44 && button.getBoundingClientRect().height >= 44));
  expect(pagesFit).toBe(true);
  const flatPages = await days.getByRole("button").evaluateAll(buttons => buttons.map(button => ({ shadow: getComputedStyle(button).boxShadow, decorations: ["::before", "::after"].map(pseudo => getComputedStyle(button, pseudo).content) })));
  expect(flatPages).toEqual(Array.from({ length: 7 }, () => ({ shadow: "none", decorations: ["none", "none"] })));
  if (info.project.name === "mobile") {
    expect(await days.evaluate(strip => strip.scrollWidth > strip.clientWidth)).toBe(true);
    await days.getByRole("button").last().focus();
    await expect.poll(() => days.evaluate(strip => strip.scrollLeft)).toBeGreaterThan(0);
    await todayPage.focus();
  }
  await days.screenshot({ path: `output/nutrition-week/calendar-pages-${info.project.name}.png` });
});

test("weekly nutrition read failures offer recovery without showing an empty day", async ({ page }) => {
  await page.route("**/rest/v1/rpc/get_nutrition_week", route => route.abort("failed"));
  await page.goto("/nutrition");
  await expect(page.getByRole("button", { name: "Retry week", exact: true })).toBeVisible();
  await expect(page.getByText("Nothing planned or logged.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add meal", exact: true }).first()).toBeDisabled();
  await page.unroute("**/rest/v1/rpc/get_nutrition_week");
  await page.getByRole("button", { name: "Retry week", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add meal", exact: true }).first()).toBeEnabled();
  await expect(page.getByRole("button", { name: "Retry week", exact: true })).toHaveCount(0);
});

test("rapid week navigation ignores an older delayed response", async ({ page }) => {
  await openNutritionPage(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let arrived!: () => void;
  const requested = new Promise<void>(resolve => { arrived = resolve; });
  const olderWeek = startOfWeek(addDays(todayKey(), 7));
  await page.route("**/rest/v1/rpc/get_nutrition_week", async route => {
    if (route.request().postDataJSON().p_week_of === olderWeek) {
      const response = await route.fetch(); arrived(); await held;
      await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await requested;
    await expect(page.getByRole("button", { name: "Add meal", exact: true }).first()).toBeDisabled();
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(page.getByRole("button", { name: "Add meal", exact: true }).first()).toBeEnabled();
    await page.getByRole("group", { name: "Nutrition summary view" }).getByRole("button", { name: "Planned", exact: true }).click();
    await expect(page.getByText(addDays(todayKey(), 14), { exact: true })).toBeVisible();
    release();
    await expect(page.getByText(addDays(todayKey(), 14), { exact: true })).toBeVisible();
    await expect(page.getByText("No meals planned.", { exact: true })).toBeVisible();
  } finally { release(); await page.unroute("**/rest/v1/rpc/get_nutrition_week"); }
});
