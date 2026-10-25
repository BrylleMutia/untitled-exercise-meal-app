import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createAuthenticatedContext, createLocalAccount, deleteLocalAccount } from "./local-account";
import { createSupabaseRepository } from "../src/services/supabaseRepository";
import { startOfWeek, todayKey } from "../src/utility/dates";
import type { Database } from "../src/types/database.generated";
import type { UserProfile } from "../src/types/domain";

async function expectMealSummaryAligned(home: Locator) {
  const geometry = await home.evaluate(element => {
    const ring = element.querySelector('[role="img"]')!;
    const circle = ring.querySelector("svg")!.getBoundingClientRect();
    const macros = element.querySelector('[aria-label="Today\'s nutrition targets"]')!.getBoundingClientRect();
    return { centerDifference: Math.abs(circle.top + circle.height / 2 - macros.top - macros.height / 2),
      sideBySide: circle.right <= macros.left, width: circle.width, height: circle.height,
      ringText: ring.textContent, extraRingContent: ring.children.length };
  });
  expect(geometry.centerDifference).toBeLessThanOrEqual(2);
  expect(geometry.sideBySide).toBe(true);
  expect(geometry.width).toBeCloseTo(116, 2);
  expect(geometry.height).toBeCloseTo(116, 2);
  expect(geometry.extraRingContent).toBe(1);
  expect(geometry.ringText).not.toMatch(/Still logging|Not logged|Daily estimate|above estimate/);
  await expect(home.getByText(/^\d+ meals? logged$/)).toHaveCount(0);
}

async function expectMealSurfaces(home: Locator) {
  const surfaces = await home.evaluate(element => {
    const summary = element.querySelector('[role="img"]')!.parentElement!.parentElement!;
    const sections = [...element.querySelectorAll<HTMLElement>(":scope > div > section")];
    const list = sections[0].parentElement!;
    const sample = document.createElement("canvas");
    sample.width = sample.height = 1;
    const paint = sample.getContext("2d")!;
    paint.fillStyle = getComputedStyle(list).backgroundColor;
    paint.fillRect(0, 0, 1, 1);
    return {
      summaryBackground: getComputedStyle(summary).backgroundColor,
      listBackground: Array.from(paint.getImageData(0, 0, 1, 1).data),
      listRadius: parseFloat(getComputedStyle(list).borderTopLeftRadius),
      overflow: getComputedStyle(list).overflow,
      backgrounds: sections.map(section => getComputedStyle(section).backgroundColor),
      borders: sections.map(section => ({ top: parseFloat(getComputedStyle(section).borderTopWidth), bottom: parseFloat(getComputedStyle(section).borderBottomWidth) })),
      gaps: sections.slice(1).map((section, index) => section.getBoundingClientRect().top - sections[index].getBoundingClientRect().bottom),
    };
  });
  expect(surfaces.summaryBackground).toBe("rgba(0, 0, 0, 0)");
  expect(surfaces.listBackground).toEqual([255, 255, 255, 128]);
  expect(surfaces.listRadius).toBeGreaterThan(0);
  expect(surfaces.overflow).toBe("visible");
  expect(surfaces.backgrounds).toEqual(Array(4).fill("rgba(0, 0, 0, 0)"));
  expect(surfaces.gaps).toEqual([0, 0, 0]);
  expect(surfaces.borders.flatMap(border => [border.top, border.bottom]).filter(width => width > 0)).toEqual([1, 1, 1]);
  expect(surfaces.borders[0].top).toBe(0);
  expect(surfaces.borders[3].bottom).toBe(0);
  await expectMealSummaryAligned(home);
  const loggedIcons = home.getByRole("button", { name: /^Undo logged / });
  await expect(loggedIcons).toHaveCount(await home.getByRole("link", { name: /^View logged / }).count());
  for (const icon of await loggedIcons.all()) {
    await expect(icon).toHaveText("");
    await expect(icon.locator("svg")).toHaveCount(1);
    const bounds = await icon.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  for (const row of await home.locator("section > ul > li").all()) {
    const shape = await row.evaluate(element => {
      const parent = element.closest("section")!.getBoundingClientRect(), bounds = element.getBoundingClientRect();
      return { radius: getComputedStyle(element).borderTopLeftRadius, widthDifference: Math.abs(parent.width - bounds.width), leftDifference: Math.abs(parent.left - bounds.left) };
    });
    expect(shape.radius).toBe("0px"); expect(shape.widthDifference).toBeLessThanOrEqual(1); expect(shape.leftDifference).toBeLessThanOrEqual(1);
    await expect(row.locator("[data-nutrition-metric]")).toHaveCount(0);
    await expect(row.getByRole("group", { name: / nutrition$/ })).toHaveCount(0);
    const content = row.locator(":scope > a, :scope > div.flex-1");
    const text = await content.evaluate(element => {
      const name = element.children[0].getBoundingClientRect(), calories = element.children[1].getBoundingClientRect();
      return { gap: calories.top - name.bottom, link: element.tagName === "A", height: element.getBoundingClientRect().height, calorieText: element.children[1].textContent };
    });
    expect(text.gap).toBeLessThanOrEqual(1);
    expect(text.calorieText).toMatch(/(?:≈\d+ kcal|Calories unavailable)/);
    if (text.link) expect(text.height).toBeGreaterThanOrEqual(44);

  }
}

async function expectHomeSummaryMatrix(page: Page, home: Locator) {
  const originalViewport = page.viewportSize();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 367, 385, 390, 403, 414, 416, 421, 462, 469, 582, 594, 760, 1440]) {
    await page.setViewportSize({ width, height: 930 });
    for (const enlarged of [false, true]) {
      const text = enlarged ? await page.addStyleTag({ content: "html { font-size: 200% !important; }" }) : null;
      await expectMealSurfaces(home);
      const positions = await Promise.all((await home.getByRole("progressbar").all()).map(bar => bar.boundingBox()));
      expect(positions[1]!.y).toBeGreaterThan(positions[0]!.y);
      expect(positions[2]!.y).toBeGreaterThan(positions[1]!.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (text) await text.evaluate(node => node.parentNode?.removeChild(node));
    }
  }
  if (originalViewport) await page.setViewportSize(originalViewport);
}

async function expectTransparentAdd(button: Locator) {
  await expect.poll(() => button.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  const styles = await button.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { background: getComputedStyle(element).backgroundColor, width: bounds.width, height: bounds.height };
  });
  expect(styles.background).toBe("rgba(0, 0, 0, 0)");
  expect(styles.width).toBeGreaterThanOrEqual(44);
  expect(styles.height).toBeGreaterThanOrEqual(44);
}

test("Home and Nutrition share modal drafts, immediate planned logs and confirmed removal", async ({ browser }, info) => {
  test.setTimeout(300_000);
  const account = await createLocalAccount("home-meals");
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword(account);
  if (login.error || !login.data.user) throw login.error;
  const repository = createSupabaseRepository(client);
  const profile: UserProfile = { id: login.data.user.id, name: "Home Meals", age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [], notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  const page = await context.newPage();
  try {
    await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: crypto.randomUUID() });
    const snapshot = (await repository.load())!;
    const date = todayKey(); const weekOf = startOfWeek(date, 0);
    const recipe = snapshot.savedMeals.find(meal => meal.id === "meal-default-hainanese-chicken-rice")!;
    expect(recipe?.ingredients).toHaveLength(11);
    await repository.editMealPlan({ currentSnapshot: snapshot, mealPlan: { ...snapshot.mealPlan!, meals: [
      { id: "home-breakfast", date, slot: "breakfast", foodId: "food-egg", label: "Breakfast egg", servings: 1 },
      { id: "home-lunch", date, slot: "lunch", mealId: recipe.id, label: "Planned chicken lunch", servings: 1.5 },
      { id: "home-skipped", date, slot: "snack", foodId: "food-egg", label: "Skipped egg", servings: 1, skipped: true },
    ] }, idempotencyKey: crypto.randomUUID() });
    await page.goto("/");
    const home = page.getByRole("region", { name: "Today's meals", exact: true });
    await expect(home.getByText("Breakfast egg", { exact: true })).toBeVisible();
    await expect(home.getByText("Planned chicken lunch", { exact: true })).toBeVisible();
    await expect(home.getByText("Skipped egg", { exact: true })).toHaveCount(0);
    await expect(home.getByText("No meals logged yet", { exact: true })).toHaveCount(0);
    await expectMealSurfaces(home);
    await home.screenshot({ path: `output/home-meals-card-${info.project.name}.png` });
    for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"]) {
      const add = home.getByRole("button", { name: `Add meal to ${slot}`, exact: true });
      await page.mouse.move(0, 0);
      await expectTransparentAdd(add);
      if (!info.project.use.isMobile) {
        await add.hover();
        await expect(page.getByRole("tooltip", { name: `Add meal to ${slot}`, exact: true })).toBeVisible();
        await expect.poll(() => add.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
      }
      await add.click();
      const modal = page.getByRole("dialog", { name: "Add meal", exact: true });
      await expect(modal).toBeVisible();
      await expect(modal.getByText(new RegExp(`^${slot} ·`))).toBeVisible();
      await modal.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(home.getByRole("button", { name: `Add meal to ${slot}`, exact: true })).toBeFocused();
    }

    await expectHomeSummaryMatrix(page, home);
    await page.setViewportSize(info.project.use.viewport ?? { width: 403, height: 930 });

    await home.getByRole("button", { name: "Add meal to Dinner", exact: true }).click();
    const recipeModal = page.getByRole("dialog", { name: "Add meal", exact: true });
    await recipeModal.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal.", exact: true }).fill(recipe.name);
    await recipeModal.getByRole("region", { name: "Saved recipes matches", exact: true }).getByRole("button").first().click();
    await recipeModal.getByRole("textbox", { name: "Recipe servings", exact: true }).fill("1.25");
    await expect(recipeModal.getByRole("button", { name: "Log meal", exact: true })).toBeEnabled();
    await expect(recipeModal.getByRole("button", { name: "Review meal", exact: true })).toHaveCount(0);
    for (const width of [320, 367, 385, 390, 403, 414, 469, 582, 594, 760, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      const text = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      expect(await recipeModal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const footerCancel = recipeModal.locator("footer").getByRole("button", { name: "Cancel", exact: true });
      await footerCancel.focus();
      await expect(footerCancel).toBeInViewport();
      await page.keyboard.press("Tab");
      await expect.poll(() => recipeModal.evaluate(element => element.contains(document.activeElement))).toBe(true);
      await text.evaluate(node => node.parentNode?.removeChild(node));
    }
    await page.setViewportSize(info.project.use.viewport ?? { width: 403, height: 930 });
    await recipeModal.screenshot({ path: `output/home-meals-modal-${info.project.name}.png` });
    await recipeModal.getByRole("button", { name: "Log meal", exact: true }).click();
    await expect(recipeModal).toHaveCount(0);
    await expect.poll(async () => (await repository.loadNutritionWeek(weekOf)).loggedMeals.find(meal => meal.slot === "dinner")?.recipeServings).toBe(1.25);

    await home.getByRole("button", { name: "Add meal to Lunch", exact: true }).click();
    let modal = page.getByRole("dialog", { name: "Add meal", exact: true });
    await modal.getByRole("button", { name: "Enter manually", exact: true }).click();
    await modal.getByLabel("Custom food name", { exact: true }).fill("Cross-route lunch");
    await modal.getByLabel("kcal", { exact: true }).fill("100");
    await modal.getByLabel("P g", { exact: true }).fill("10");
    await modal.getByLabel("C g", { exact: true }).fill("15");
    await modal.getByLabel("F g", { exact: true }).fill("2");
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.goto("/nutrition");
    for (const slot of ["breakfast", "lunch", "dinner", "snack"]) {
      const add = page.locator(`#add-meal-${slot}`);
      await expect(add).toBeEnabled();
      await page.mouse.move(0, 0);
      await expectTransparentAdd(add);
      await add.click();
      const dialog = page.getByRole("dialog", { name: "Add meal", exact: true });
      await expect(dialog.getByText(new RegExp(`^${slot[0].toUpperCase() + slot.slice(1)} ·`))).toBeVisible();
      await dialog.locator("footer").getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(add).toBeFocused();
    }
    await page.locator("#add-meal-lunch").click();
    modal = page.getByRole("dialog", { name: "Add meal", exact: true });
    await modal.getByRole("button", { name: "Enter manually", exact: true }).click();
    await expect(modal.getByLabel("Custom food name", { exact: true })).toHaveValue("Cross-route lunch");
    await expect(modal.getByLabel("kcal", { exact: true })).toHaveValue("100");
    await modal.getByRole("button", { name: "Review meal", exact: true }).click();
    await modal.getByRole("button", { name: "Log meal", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await page.goto("/");
    await expect(home.getByRole("link", { name: "View logged Cross-route lunch in Nutrition", exact: true })).toBeVisible();
    await expectMealSurfaces(home);

    await page.route("**/rest/v1/rpc/log_planned_meal", route => route.abort("failed"));
    await home.getByRole("button", { name: "Log planned Planned chicken lunch", exact: true }).click();
    await expect(home.getByText(/meal was not confirmed as logged/)).toBeVisible();
    await page.unroute("**/rest/v1/rpc/log_planned_meal");
    await home.getByRole("button", { name: "Log planned Planned chicken lunch", exact: true }).click();
    await expect(home.getByRole("button", { name: "Log planned Planned chicken lunch", exact: true })).toHaveCount(0);
    await expect(home.getByRole("region", { name: "Lunch", exact: true }).getByRole("link", { name: `View logged ${recipe.name} in Nutrition`, exact: true })).toBeVisible();
    await expect.poll(async () => (await repository.loadNutritionWeek(weekOf)).loggedMeals.filter(meal => meal.plannedMealId === "home-lunch").length).toBe(1);
    await expectHomeSummaryMatrix(page, home);
    await page.setViewportSize({ width: 416, height: 930 });
    await page.mouse.move(0, 0);
    await page.keyboard.press("Escape");
    await home.screenshot({ path: `output/home-alignment-populated-${info.project.name}.png` });
    await home.locator('[role="img"]').first().locator("..").locator("..").screenshot({ path: `output/home-alignment-summary-${info.project.name}.png` });
    await page.setViewportSize(info.project.use.viewport ?? { width: 403, height: 930 });

    const undoLunch = home.getByRole("region", { name: "Lunch", exact: true }).getByRole("button", { name: `Undo logged ${recipe.name}`, exact: true });
    let releaseUndo!: () => void;
    const pendingUndo = new Promise<void>(resolve => { releaseUndo = resolve; });
    let failedUndoKey: string | undefined;
    await page.route("**/rest/v1/rpc/delete_logged_meal", async route => {
      failedUndoKey = route.request().postDataJSON().p_payload.idempotencyKey;
      await pendingUndo; await route.abort("failed");
    });
    await undoLunch.click();
    await expect(undoLunch).toBeDisabled();
    await expect(home.locator("#home-add-meal-lunch")).toBeDisabled();
    releaseUndo();
    await expect(home.getByText(/meal log could not be undone/)).toBeVisible();
    await expect(undoLunch).toBeEnabled();
    await page.unroute("**/rest/v1/rpc/delete_logged_meal");
    const retriedUndo = page.waitForRequest("**/rest/v1/rpc/delete_logged_meal");
    await undoLunch.click();
    expect((await retriedUndo).postDataJSON().p_payload.idempotencyKey).toBe(failedUndoKey);
    await expect(home.getByRole("button", { name: "Log planned Planned chicken lunch", exact: true })).toBeVisible();
    await expect(home.locator("#home-add-meal-lunch")).toBeFocused();
    let undone = await repository.loadNutritionWeek(weekOf);
    expect(undone.loggedMeals.some(meal => meal.plannedMealId === "home-lunch")).toBe(false);
    expect(undone.nutritionLogs.some(entry => entry.plannedMealId === "home-lunch")).toBe(false);
    expect(undone.mealPlan!.meals.some(meal => meal.id === "home-lunch")).toBe(true);
    await home.getByRole("button", { name: "Log planned Planned chicken lunch", exact: true }).click();
    await expect(undoLunch).toBeVisible();
    const undoDinner = home.getByRole("region", { name: "Dinner", exact: true }).getByRole("button", { name: `Undo logged ${recipe.name}`, exact: true });
    await undoDinner.focus();
    await expect(page.getByRole("tooltip", { name: "Undo meal log", exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(undoDinner).toHaveCount(0);
    await expect(home.locator("#home-add-meal-dinner")).toBeFocused();
    undone = await repository.loadNutritionWeek(weekOf);
    expect(undone.loggedMeals.some(meal => meal.slot === "dinner")).toBe(false);
    expect(undone.nutritionLogs.some(entry => entry.slot === "dinner")).toBe(false);

    await home.getByRole("button", { name: "Add meal to Snack", exact: true }).click();
    const foodModal = page.getByRole("dialog", { name: "Add meal", exact: true });
    await foodModal.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal.", exact: true }).fill("egg");
    await foodModal.getByRole("region", { name: "Food matches", exact: true }).getByRole("button", { name: /^Egg/ }).first().click();
    const foodReview = foodModal.getByRole("region", { name: "Selected food portion", exact: true });
    await foodReview.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("2");
    await foodReview.getByRole("button", { name: "Add to plan", exact: true }).click();
    await expect(foodModal).toHaveCount(0);
    await home.getByRole("button", { name: "Log planned Egg", exact: true }).click();
    await expect(home.getByRole("region", { name: "Snack", exact: true }).getByRole("link", { name: "View logged Egg in Nutrition", exact: true })).toBeVisible();
    const undoFood = home.getByRole("button", { name: "Undo logged Egg", exact: true });
    await undoFood.click();
    await expect(home.getByRole("button", { name: "Log planned Egg", exact: true })).toBeVisible();
    await home.getByRole("button", { name: "Log planned Egg", exact: true }).click();
    await expect(undoFood).toBeVisible();

    const remove = home.getByRole("button", { name: "Remove planned Breakfast egg", exact: true });
    await remove.click();
    let confirmation = page.getByRole("dialog", { name: "Remove planned meal?", exact: true });
    await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0); await expect(remove).toBeFocused();
    await remove.click();
    confirmation = page.getByRole("dialog", { name: "Remove planned meal?", exact: true });
    await page.route("**/rest/v1/rpc/edit_meal_plan", route => route.abort("failed"));
    await confirmation.getByRole("button", { name: "Remove meal", exact: true }).click();
    await expect(confirmation.getByText(/could not be removed/)).toBeVisible();
    await page.unroute("**/rest/v1/rpc/edit_meal_plan");
    await confirmation.getByRole("button", { name: "Remove meal", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(home.getByText("Breakfast egg", { exact: true })).toHaveCount(0);
    await expect(home.locator("#home-add-meal-breakfast")).toBeFocused();
    await page.goto("/nutrition");
    await expect(page.getByText("Nothing planned or logged.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Restore planned Skipped egg", exact: true })).toBeVisible();
    const saved = await repository.loadNutritionWeek(weekOf);
    expect(saved.nutritionLogs.length).toBeGreaterThan(0);
    expect(saved.loggedMeals.filter(meal => meal.plannedMealId === "home-lunch")).toHaveLength(1);
    expect(saved.mealPlan!.meals.some(meal => meal.id === "home-breakfast")).toBe(false);
  } finally {
    await context.close();
    await deleteLocalAccount(account);
  }
});

test("selected portions log or plan directly with visible advisory warnings, stable retries and cross-route recovery", async ({ browser }, info) => {
  test.setTimeout(240_000);
  const account = await createLocalAccount("direct-portions");
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword(account);
  if (login.error || !login.data.user) throw login.error;
  const repository = createSupabaseRepository(client);
  const profile: UserProfile = { id: login.data.user.id, name: "Direct portions", age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "Vegan low-carb", allergies: ["soy"], cookingTimeMinutes: 15, notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  const page = await context.newPage();
  try {
    const base = (await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: crypto.randomUUID() })).snapshot;
    const recipe = base.savedMeals.find(meal => meal.id === "meal-korean-beef-bowl")!;
    const date = todayKey(), weekOf = startOfWeek(date, 0);
    await page.goto("/");
    const home = page.getByRole("region", { name: "Today's meals", exact: true });
    const plus = home.getByRole("button", { name: "Add meal to Dinner", exact: true });
    await plus.click();
    const modal = page.getByRole("dialog", { name: "Add meal", exact: true });
    const search = modal.getByRole("textbox", { name: "Search foods or saved recipes, or describe a meal.", exact: true });
    await search.fill(recipe.name);
    await modal.getByRole("region", { name: "Saved recipes matches" }).getByRole("button").first().click();
    const portion = modal.getByRole("region", { name: "Selected meal portion" });
    for (const invalid of ["", "0", "-1"]) {
      const amount = portion.getByRole("textbox", { name: "Recipe servings", exact: true });
      await amount.fill(invalid);
      await expect(portion.getByRole("button", { name: "Log meal", exact: true })).toBeDisabled();
      await expect(portion.getByRole("button", { name: "Add to plan", exact: true })).toBeDisabled();
      const description = await amount.getAttribute("aria-describedby");
      expect(description).toBeTruthy();
      await expect(portion.locator(`[id="${description}"]`)).toContainText("positive servings");
    }
    await portion.getByRole("textbox", { name: "Recipe servings", exact: true }).fill("2.5");
    await expect(portion.getByRole("button", { name: "Log meal", exact: true })).toBeEnabled();
    await expect(portion.getByRole("button", { name: "Add to plan", exact: true })).toBeEnabled();
    await expect(modal.getByRole("button", { name: "Review meal", exact: true })).toHaveCount(0);
    const assessment = portion.getByRole("region", { name: "Planning assessment" });
    await expect(assessment).toContainText("source-provided");
    await expect(assessment).toContainText("Vegan low-carb");
    await expect(assessment).toContainText("soy");
    await expect(assessment).toContainText("130 g");
    for (const width of [320, 367, 385, 390, 403, 414, 469, 570, 582, 594, 760, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const enlarged of [false, true]) {
        await page.evaluate(value => { document.documentElement.style.fontSize = value ? "200%" : ""; }, enlarged);
        expect(await modal.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        for (const name of ["Log meal", "Add to plan", "Change selection"]) {
          const action = portion.getByRole("button", { name, exact: true });
          await action.scrollIntoViewIfNeeded(); await action.focus(); await expect(action).toBeInViewport();
          const box = await action.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await page.setViewportSize({ width: 414, height: 930 });
    await portion.getByRole("button", { name: "Change selection", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(portion.getByRole("button", { name: "Add to plan", exact: true })).toBeFocused();
    await expect(portion.getByRole("button", { name: "Add to plan", exact: true })).toBeInViewport();
    await portion.screenshot({ path: `output/direct-portion-${info.project.name}.png` });
    await modal.locator("footer").getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(plus).toBeFocused();
    await page.goto("/nutrition");
    await page.locator("#add-meal-dinner").click();
    await expect(portion.getByRole("textbox", { name: "Recipe servings", exact: true })).toHaveValue("2.5");
    const requests: Array<{ idempotencyKey: string; reviewAcknowledged: boolean; reviewPolicyVersion: string }> = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/rest/v1/rpc/add_planned_meal", async route => {
      requests.push(route.request().postDataJSON().p_payload);
      await gate;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "retryable: test connection failed" }) });
    });
    await portion.getByRole("button", { name: "Add to plan", exact: true }).click();
    await expect(modal.locator("footer").getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await expect(portion.getByRole("textbox", { name: "Recipe servings", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape"); await expect(modal).toBeVisible();
    release();
    await expect(portion.getByText(/save was not confirmed/)).toBeVisible();
    await page.unroute("**/rest/v1/rpc/add_planned_meal");
    page.on("request", request => { if (request.url().endsWith("/rpc/add_planned_meal")) requests.push(request.postDataJSON().p_payload); });
    await portion.getByRole("button", { name: "Add to plan", exact: true }).click();
    await expect(modal).toHaveCount(0);
    expect(requests).toHaveLength(2); expect(requests[0].idempotencyKey).toBe(requests[1].idempotencyKey);
    expect(requests[1]).toMatchObject({ reviewAcknowledged: true, reviewPolicyVersion: "advisory_v1" });
    let week = await repository.loadNutritionWeek(weekOf);
    expect(week.mealPlan!.preferencePolicy).toBe("advisory_v1");
    expect(week.mealPlan!.meals.find(meal => meal.id.startsWith("planned-meal-") && meal.mealId === recipe.id)).toMatchObject({ servings: 2.5, expectedCarbsG: 145 });
    expect(week.loggedMeals).toHaveLength(0);
    await expect(page.locator("#add-meal-dinner")).toBeFocused();
    await page.locator("#add-meal-lunch").click();
    await expect(search).toHaveValue("");
    await search.fill("egg");
    await modal.getByRole("region", { name: "Food matches" }).getByRole("button", { name: /^Egg/ }).first().click();
    const food = modal.getByRole("region", { name: "Selected food portion" });
    await food.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("0.5");
    await food.getByRole("button", { name: "Change selection", exact: true }).click();
    await expect(search).toBeFocused(); await expect(search).toHaveValue("egg");
    await modal.getByRole("region", { name: "Food matches" }).getByRole("button", { name: /^Egg/ }).first().click();
    await food.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("0.5");
    await food.getByRole("button", { name: "Log meal", exact: true }).click();
    await expect(modal).toHaveCount(0);
    week = await repository.loadNutritionWeek(weekOf);
    expect(week.nutritionLogs.find(log => log.slot === "lunch" && log.foodId === "food-egg")?.servings).toBe(0.5);
    await page.locator("#add-meal-snack").click();
    let providerForLog = false;
    await page.route("**/functions/v1/nutrition-search", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ fdcId: providerForLog ? "direct-test-lentils-log" : "direct-test-lentils", recordType: "Foundation", name: "Direct test lentils", servingLabel: "100 g", servingGrams: 100, unit: "g", calories: 120, proteinG: 8, carbsG: 20, fatG: 0, nutrientsPer100g: { calories: 120, proteinG: 8, carbsG: 20, fatG: 0 }, source: "USDA FoodData Central", sourceVersion: "test", estimated: false, confidence: "high", preparationBasis: "cooked" }] }) }));
    await search.fill("Direct test lentils");
    await modal.getByRole("button", { name: "Search trusted USDA", exact: true }).click();
    await modal.getByRole("button", { name: /^Direct test lentils.*USDA test/ }).click();
    await expect(food.getByRole("button", { name: "Log meal", exact: true })).toBeEnabled();
    await food.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("1.5");
    await food.getByRole("button", { name: "Add to plan", exact: true }).click();
    await expect(modal).toHaveCount(0);
    expect((await repository.loadNutritionWeek(weekOf)).mealPlan!.meals.find(meal => meal.foodId === "food-fdc-direct-test-lentils")?.servings).toBe(1.5);
    providerForLog = true;
    await page.locator("#add-meal-breakfast").click();
    await search.fill("Direct test lentils");
    await modal.getByRole("button", { name: "Search trusted USDA", exact: true }).click();
    await modal.getByRole("button", { name: /^Direct test lentils.*USDA test/ }).click();
    await food.getByRole("spinbutton", { name: "Quantity", exact: true }).fill("0.75");
    await page.route("**/rest/v1/rpc/save_nutrition_log", route => route.abort("failed"));
    await food.getByRole("button", { name: "Log meal", exact: true }).click();
    await expect(food.getByText(/save was not confirmed/)).toBeVisible();
    await expect(food.getByRole("spinbutton", { name: "Quantity", exact: true })).toHaveValue("0.75");
    await expect(food.getByRole("button", { name: "Log meal", exact: true })).toBeEnabled();
    await page.unroute("**/rest/v1/rpc/save_nutrition_log");
    await food.getByRole("button", { name: "Log meal", exact: true }).click();
    await expect(modal).toHaveCount(0);
    expect((await repository.loadNutritionWeek(weekOf)).nutritionLogs.filter(log => log.foodId === "food-fdc-direct-test-lentils-log")).toHaveLength(1);
    await expect(page.locator("#add-meal-breakfast")).toBeFocused();
    const customId = `direct-stale-${crypto.randomUUID()}`;
    await repository.saveRecipe({ currentSnapshot: (await repository.load())!, newFoods: [], idempotencyKey: crypto.randomUUID(), meal: { id: customId, name: "Direct stale recipe", servings: 1, notes: "Cook and serve.", complexity: "easy", totalTimeMinutes: 45, mealSlots: ["dinner"], ingredients: [{ foodId: "food-egg", servings: 1 }], providedNutrition: { calories: 200, proteinG: 10, carbsG: 40, fatG: 2 } } });
    await page.reload();
    await page.locator("#add-meal-dinner").click();
    await search.fill("Direct stale recipe");
    await modal.getByRole("region", { name: "Saved recipes matches" }).getByRole("button").first().click();
    await portion.getByRole("textbox", { name: "Recipe servings", exact: true }).fill("0.5");
    const savedRecipeSnapshot = (await repository.load())!;
    const ownRecipe = savedRecipeSnapshot.savedMeals.find(meal => meal.id === customId)!;
    await repository.saveRecipe({ currentSnapshot: savedRecipeSnapshot, newFoods: [], idempotencyKey: crypto.randomUUID(), meal: { ...ownRecipe, notes: "Cook thoroughly, then serve." } });
    await portion.getByRole("button", { name: "Add to plan", exact: true }).click();
    await expect(portion.getByRole("button", { name: "Use updated recipe", exact: true })).toBeVisible();
    await expect(portion.getByRole("textbox", { name: "Recipe servings", exact: true })).toHaveValue("0.5");
    await expect(portion.getByRole("button", { name: "Add to plan", exact: true })).toBeDisabled();
    await portion.getByRole("button", { name: "Use updated recipe", exact: true }).click();
    await portion.getByRole("button", { name: "Add to plan", exact: true }).click();
    await expect(modal).toHaveCount(0);
    await page.locator("#add-meal-breakfast").click();
    await search.fill("Direct stale recipe");
    await modal.getByRole("region", { name: "Saved recipes matches" }).getByRole("button").first().click();
    await repository.archiveMeal({ mealId: customId, currentSnapshot: (await repository.load())!, idempotencyKey: crypto.randomUUID() });
    await portion.getByRole("button", { name: "Add to plan", exact: true }).click();
    await portion.getByRole("button", { name: "Refresh recipes", exact: true }).click();
    await expect(portion.getByText(/archived or unavailable/)).toBeVisible();
    await expect(portion.getByRole("button", { name: "Add to plan", exact: true })).toBeDisabled();
    await modal.locator("footer").getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.locator("#add-meal-breakfast")).toBeFocused();
  } finally { await context.close(); await deleteLocalAccount(account); }
});
