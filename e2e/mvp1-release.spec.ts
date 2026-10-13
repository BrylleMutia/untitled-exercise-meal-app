import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import fs from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import {
  createAuthenticatedContext,
  createLocalAccount,
  deleteLocalAccount,
  type LocalAccount,
} from "./local-account";

const userAState = "playwright/.auth/user-a.json";
const userBState = "playwright/.auth/user-b.json";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function fillRecipeSection(editor: Locator, section: "Details" | "Instructions", label: string, value: string) {
  await editor.getByRole("tab", { name: section, exact: true }).click();
  await editor.getByLabel(label).fill(value);
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
}

async function openRecipe(page: Page) {
  await openNutritionPage(page);
  await clearBrowserDrafts(page);
  await page.getByRole("region", { name: "Saved meals" }).getByRole("button", { name: "Create", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Create recipe", exact: true });
  await editor.getByLabel("Complexity (required)", { exact: true }).selectOption("easy");
  return editor;
}

test("predefined recipe catalog displays the replacement image, complete metadata and source", async ({ page }, info) => {
  await openNutritionPage(page);
  const saved = page.getByRole("region", { name: "Saved meals" });
  const row = saved.getByRole("listitem").filter({ has: page.getByRole("button", { name: "View recipe: Creamy Lemon Chicken", exact: true }) });
  await expect(row).toBeVisible();
  for (const name of ["Greek Yogurt Berry Bowl", "PB Banana Toast", "Chicken & Rice Plate", "Salmon & Sweet Potato", "Egg, Broccoli & Almond Plate", "Chicken & Broccoli Plate", "Tofu & Broccoli Plate", "Tofu, Broccoli & Almond Bowl"]) {
    await expect(saved.getByRole("button", { name: `View recipe: ${name}`, exact: true })).toHaveCount(0);
  }
  const cover = row.locator("img");
  await expect(cover).toHaveAttribute("src", "/images/recipes/creamy-lemon-chicken.png");
  expect(await cover.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
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
  await expect(overview.getByText(/Seasonings are unmeasured and excluded/)).toBeVisible();
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
    const saved = recipePage.getByRole("region", { name: "Saved meals" });
    const card = (name: string) => saved.getByRole("listitem").filter({ has: recipePage.getByRole("button", { name: `View recipe: ${name}`, exact: true }) });
    const original = card("Korean Beef Bowl");
    await expect(original.getByText("≈560 kcal", { exact: true })).toBeVisible();
    await expect(original.getByText("Not set", { exact: true })).toBeVisible();
    await expect(original.locator("img")).toHaveAttribute("src", "/images/recipes/korean-beef-bowl.png");
    await expect(original.getByRole("button", { name: "Edit Korean Beef Bowl", exact: true })).toBeEnabled();
    await original.screenshot({ path: `output/korean-beef-bowl/card-${info.project.name}.png` });
    await original.getByRole("button", { name: "Log", exact: true }).click();
    await original.getByRole("combobox", { name: "Meal slot", exact: true }).selectOption("lunch");
    let response = nextRpcResponse(recipePage, "save_reviewed_meal");
    await original.getByRole("button", { name: "Confirm log", exact: true }).click();
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
    await card("Creamy Lemon Chicken").getByRole("button", { name: "Archive Creamy Lemon Chicken", exact: true }).click();
    expect((await response).ok()).toBe(true);
    await recipePage.reload();
    await expect(card("Creamy Lemon Chicken")).toHaveCount(0);
    await page.goto("/nutrition");
    await expect(page.getByRole("region", { name: "Saved meals" }).getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Saved meals" }).getByRole("button", { name: "View recipe: Creamy Lemon Chicken", exact: true })).toBeVisible();
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
  const saved = page.getByRole("region", { name: "Saved meals" });
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

test("recipe card refinements preserve calorie basis, yield, icon controls and Medium defaults", async ({ page }, info) => {
  await openNutritionPage(page); await clearBrowserDrafts(page);
  const saved = page.getByRole("region", { name: "Saved meals" });
  const row = saved.getByRole("listitem").filter({ has: page.getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true }) });
  await expect(row.getByText("≈560 kcal", { exact: true })).toBeVisible();
  await expect(row.getByRole("img", { name: "Recipe yields 4 servings", exact: true })).toBeVisible();
  await expect(row.getByRole("img", { name: "Approximately 560 calories per serving", exact: true })).toBeVisible();
  await expect(saved.getByRole("button", { name: "Duplicate", exact: true })).toHaveCount(0);
  const log = row.getByRole("button", { name: "Log", exact: true });
  const edit = row.getByRole("button", { name: "Edit Korean Beef Bowl", exact: true });
  const archive = row.getByRole("button", { name: "Archive Korean Beef Bowl", exact: true });
  await log.focus(); await page.keyboard.press("Tab"); await expect(edit).toBeFocused();
  await expect(row.getByRole("tooltip", { name: "Edit", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(row.getByRole("tooltip")).toHaveCount(0);
  await page.keyboard.press("Tab"); await expect(archive).toBeFocused();
  const editBox = await edit.boundingBox(); const archiveBox = await archive.boundingBox();
  expect(editBox!.width).toBeGreaterThanOrEqual(48); expect(editBox!.height).toBeGreaterThanOrEqual(48);
  expect(archiveBox!.width).toBeGreaterThanOrEqual(48);
  await edit.click();
  const editDialog = page.getByRole("dialog", { name: "Edit recipe", exact: true });
  await editDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edit).toBeFocused();
  await log.click(); await expect(row.getByRole("combobox", { name: "Meal slot", exact: true })).toBeFocused();
  const confirmation = row.getByRole("group", { name: "Log Korean Beef Bowl", exact: true });
  expect((await confirmation.boundingBox())!.y).toBeLessThan((await log.boundingBox())!.y);
  await row.getByRole("button", { name: "Cancel", exact: true }).click();
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
  await editor.getByLabel("Recipe servings", { exact: true }).fill("2.5");
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
  await expect(created.getByRole("img", { name: "Recipe yields 2.5 servings", exact: true })).toBeVisible();
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
  await minus.click();
  await expect(servings).toHaveValue("0");
  await expect(minus).toBeDisabled();
  await servings.fill("1.5"); await plus.click(); await minus.click();
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
  await page.getByRole("region", { name: "Saved meals" }).getByRole("button", { name: "Create", exact: true }).click();
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
  await editor.getByRole("button", { name: "Add custom ingredient", exact: true }).click();
  await editor.getByLabel("Custom ingredient name").fill("Recipe test ingredient");
  await editor.getByLabel("Custom serving label").fill("100 g");
  await editor.getByLabel("Custom grams per serving").fill("100");
  for (const [metric,value] of [["calories","100"],["protein","10"],["carbs","20"],["fat","0"]]) await editor.getByLabel(`Custom ${metric}`, { exact: true }).fill(value);
  await editor.getByRole("button", { name: "Add custom ingredient to recipe" }).click();
  await expect(editor.getByPlaceholder("Quantity", { exact: true })).toHaveValue("");
  await editor.getByLabel("Recipe test ingredient quantity").fill("1.5");
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
  await page.getByRole("region", { name: "Saved meals" }).getByRole("button", { name: "Create", exact: true }).click();
  await expect(editor.getByText("Recipe draft restored.")).toBeVisible();
  await expect(editor.getByLabel("Recipe test ingredient quantity")).toHaveValue("1.5");
  await expect(pills).toContainText("50 kcal");
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
  const saved = page.getByRole("region", { name: "Saved meals" }).getByRole("listitem").filter({ hasText: name }).first();
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
  await page.getByRole("region", { name: "Saved meals" }).getByRole("button", { name: "Create", exact: true }).click();
  editor = page.getByRole("dialog", { name: "Create recipe", exact: true });
  await expect(editor.getByText("Recipe draft restored.")).toBeVisible();
  await expect(editor.getByLabel("Reference (optional)")).toHaveValue("Cookbook page 4");
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
  await review.getByLabel("Greek yogurt unit").selectOption("serving");
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
  await page.getByRole("region", { name: "Saved meals" }).getByRole("button", { name: "Create", exact: true }).click();
  await expect(editor.getByText("Recipe draft restored.")).toBeVisible();
  await editor.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(editor.getByLabel("Recipe name", { exact: true })).toHaveValue("");
  await expect(editor.getByLabel("Recipe servings", { exact: true })).toHaveValue("");
  await expect(editor.getByLabel("Ingredient description")).toHaveCount(0);
});

test("recipe authoring fills trusted search nutrition and retains input when search fails", async ({ page }) => {
  const editor = await openRecipe(page);
  await editor.getByLabel("Recipe servings", { exact: true }).fill("2");
  await editor.getByLabel("Ingredient search").fill("Test lentils");
  await page.route("**/functions/v1/nutrition-search", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ fdcId: "recipe-test-lentils", recordType: "Foundation", name: "Test lentils", servingLabel: "100 g", servingGrams: 100, unit: "g", calories: 120, proteinG: 8, carbsG: 20, fatG: 0, nutrientsPer100g: { calories: 120, proteinG: 8, carbsG: 20, fatG: 0 }, source: "USDA FoodData Central", sourceVersion: "test", estimated: false, confidence: "high", preparationBasis: "cooked" }] }) }));
  await editor.getByRole("button", { name: "Search trusted USDA", exact: true }).click();
  await editor.getByRole("button", { name: /Test lentils.*USDA FoodData Central/ }).click();
  await expect(editor.getByText("100 g · cooked · USDA FoodData Central", { exact: true })).toBeVisible();
  await editor.getByLabel("Test lentils quantity").fill("150");
  await editor.getByLabel("Test lentils unit").selectOption("g");
  await expect(editor.getByRole("group", { name: "Recipe nutrition per serving" })).toContainText("90 kcal");
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
  const editor = await openRecipe(page);
  const create = page.getByRole("region", { name: "Saved meals" }).getByRole("button", { name: "Create", exact: true });
  await expect(editor.getByLabel("Recipe name", { exact: true })).toBeFocused();
  await expect(editor).toHaveAttribute("aria-modal", "true");
  await expect(editor.getByRole("heading", { name: "Recipe basics", exact: true })).toHaveCount(0);
  await expect(editor.getByRole("region", { name: "Recipe basics", exact: true })).toBeVisible();
  await expect(editor.getByRole("heading", { name: "Ingredients", exact: true })).toBeVisible();
  await editor.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(editor.getByRole("tabpanel", { name: "Details", exact: true })).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Reference (optional)", exact: true })).toBeVisible();
  await editor.getByRole("tab", { name: "Ingredients", exact: true }).click();
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
  await editor.getByLabel("Ingredient search").fill("eggs");
  await editor.getByRole("button", { name: /^Egg.*1 large egg/ }).click();
  await editor.getByLabel("Egg quantity", { exact: true }).fill("1");
  await fillRecipeSection(editor, "Instructions", "Instructions (required)", "Prepare and serve.");
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
  await expect(page.getByRole("region", { name: "Saved meals" }).getByRole("button", { name: "Create", exact: true })).toBeFocused();
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
  await expect(page.getByRole("region", { name: "Saved meals" }).getByRole("listitem").first()).toBeVisible();
  await page.getByRole("region", { name: slot, exact: true }).getByRole("button", { name: "Add meal", exact: true }).click();

}

async function openNutritionPage(page: Page) {
  await page.goto("/nutrition");
  await expect(page.getByRole("region", { name: "Saved meals" }).getByRole("listitem").first()).toBeVisible();
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
    await journeyPage.getByRole("button", { name: `Increase ${customItem}` }).click();
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
    await expect(firstEaten.getByRole("button", { name: "Log again" })).toBeFocused();
    await firstEaten.getByRole("button", { name: "Log again" }).click();
    await firstEaten.getByRole("spinbutton", { name: "Actual servings" }).fill("1.5");
    const secondLog = nextRpcResponse(page, "log_planned_meal");
    await firstEaten.getByRole("button", { name: "Confirm log" }).click();
    expect((await secondLog).ok()).toBe(true);
    await expect(breakfast.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore);
    await expect(breakfast.getByText("Eaten", { exact: true })).toHaveCount(eatenBefore + 2);
    const secondEaten = breakfast.getByRole("listitem").filter({ hasText: "Egg ×1.5" }).last();
    const secondDeleted = nextRpcResponse(page, "delete_nutrition_log");
    await secondEaten.getByRole("button", { name: "Delete Egg" }).click();
    expect((await secondDeleted).ok()).toBe(true);
    await expect(breakfast.getByText(/^Planned(?: ·|$)/)).toHaveCount(plannedBefore);
    const firstDeleted = nextRpcResponse(page, "delete_nutrition_log");
    await firstEaten.getByRole("button", { name: "Delete Egg" }).click();
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
    await expect(eatenRecipe.getByRole("button", { name: "Log again" })).toBeVisible();
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

  test("requires a slot before logging a saved meal", async ({ page }) => {
    await page.goto("/nutrition");
    const savedMeals = page.getByRole("region", { name: "Saved meals" });
    await expect(savedMeals.getByRole("listitem").first()).toBeVisible();
    const loggedDinnerMeals = page.getByRole("region", { name: "Dinner" }).getByRole("button", { name: /^Eaten Creamy Lemon Chicken/ });
    const beforeCount = await loggedDinnerMeals.count();
    const firstMeal = savedMeals.getByRole("listitem").filter({ has: page.getByRole("button", { name: "View recipe: Creamy Lemon Chicken", exact: true }) });
    await firstMeal.getByRole("button", { name: "Log" }).click();
    const picker = firstMeal.getByRole("group", { name: /^Log / });
    await expect(picker.getByRole("button", { name: "Confirm log" })).toBeDisabled();
    await picker.getByRole("combobox", { name: "Meal slot" }).selectOption("dinner");
    const saved = nextRpcResponse(page, "save_reviewed_meal");
    await picker.getByRole("button", { name: "Confirm log" }).click();
    expect((await saved).ok()).toBe(true);
    await expect(picker).toHaveCount(0);
    await expect(loggedDinnerMeals).toHaveCount(beforeCount + 1);
    const loggedMeal = loggedDinnerMeals.last();
    await loggedMeal.click();
    await expect(loggedMeal).toHaveAttribute("aria-expanded", "true");
    const loggedRow = loggedMeal.locator("xpath=ancestor::li[1]");
    await loggedRow.getByRole("button", { name: "Edit Creamy Lemon Chicken" }).click();
    await expect(loggedRow.getByRole("group", { name: "Edit logged meal history" })).toBeVisible();
    await loggedRow.getByRole("button", { name: "Discard changes" }).click();
    const deleted = nextRpcResponse(page, "delete_logged_meal");
    await loggedRow.getByRole("button", { name: "Delete Creamy Lemon Chicken" }).click();
    expect((await deleted).ok()).toBe(true);
    await expect(loggedDinnerMeals).toHaveCount(beforeCount);
  });

  test("keeps logged food after a planned meal is skipped", async ({ page }) => {
    await logEgg(page);
    const dayCard = page.getByRole("region", { name: "Planned" });
    const breakfast = dayCard.getByRole("region", { name: "Breakfast" });
    const beforeCount = await breakfast.getByText("Eaten", { exact: true }).count();
    const firstPlanned = breakfast.getByRole("listitem").filter({ hasText: "Planned" }).first();
    const skip = firstPlanned.getByRole("button", { name: /^(Skip|Plan again)$/ });
    const changed = nextRpcResponse(page, "skip_planned_meal");
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
      const increase = page.getByRole("button", { name: /^Increase / }).first();
      const competingIncrease = secondPage.getByRole("button", { name: /^Increase / }).first();
      const firstEdit = nextRpcResponse(page, "set_grocery_quantity");
      await increase.click();
      await expect(page.getByText(/adjusted by you/i).first()).toBeVisible();
      expect((await firstEdit).ok()).toBe(true);

      await secondPage.route("**/rest/v1/**", (route) => {
        if (route.request().method() === "GET") return route.abort("failed");
        return route.continue();
      });
      await competingIncrease.click();
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
  const savedCard = page.getByRole("region", { name: "Saved meals" }).getByRole("listitem").filter({ has: page.getByRole("button", { name: "View recipe: Korean Beef Bowl", exact: true }) });
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
