import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createAuthenticatedContext, createLocalAccount, deleteLocalAccount, type LocalAccount } from "./local-account";
import { createSupabaseRepository } from "../src/services/supabaseRepository";
import { cookingGroupRepository } from "../src/services/cookingGroupRepository";
import { providedRecipeLogEntry } from "../src/utility/providedRecipeNutrition";
import { addDays, formatFullDate, startOfWeek, todayKey } from "../src/utility/dates";
import type { Database } from "../src/types/database.generated";
import type { UserProfile } from "../src/types/domain";

async function expectPanelGeometry(page: Page, planned: Locator, recipes: Locator, mobile: boolean) {
  const meals = await planned.evaluate(parent => {
    const outer = parent.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(parent).paddingLeft);
    return [...parent.querySelectorAll("section > ul > li")].map(row => {
      const bounds = row.getBoundingClientRect(), style = getComputedStyle(row);
      const layout = row.children[0], summary = layout.querySelector("[data-meal-summary]")!, actions = layout.querySelector("[data-meal-actions]")!, thumbnail = layout.querySelector("[data-meal-thumbnail]")!;
      const summaryBox = summary.getBoundingClientRect(), actionsBox = actions.getBoundingClientRect(), thumbnailBox = thumbnail.getBoundingClientRect();
      const image = thumbnail.querySelector("img")!, imageBox = image.getBoundingClientRect();
      const pillGroup = summary.querySelector<HTMLElement>('[role="group"]')!;
      const pill = pillGroup.querySelector<HTMLElement>('[data-nutrition-metric]')!;
      const pillStyle = getComputedStyle(pill), fontScale = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
      return { left: bounds.left - outer.left, right: outer.right - bounds.right,
        padding: parseFloat(style.paddingLeft), contentInset: parseFloat(style.paddingRight), radius: parseFloat(style.borderTopLeftRadius), inset,
        summaryLeft: summaryBox.left - bounds.left, summaryRight: bounds.right - summaryBox.right,
        actionsLeft: actionsBox.left - bounds.left, actionCenter: actionsBox.top + actionsBox.height / 2 - (summaryBox.top + summaryBox.height / 2),
        serving: summary.querySelector("[data-meal-serving]")?.textContent,
        pillTexts: [...pillGroup.querySelectorAll<HTMLElement>("[data-nutrition-metric]")].map(pill => pill.innerText),
        statusLabel: row.getAttribute("aria-label"),
        routineCaptions: [...summary.querySelectorAll("span, p")].filter(element => /^(Planned|Eaten|Planned · skipped|your entry|source-provided|user-provided recipe|user · as_labeled)$/.test(element.textContent ?? "")).length,
        direction: getComputedStyle(layout).flexDirection,
        pillHorizontal: parseFloat(pillStyle.paddingLeft) / fontScale,
        pillVertical: parseFloat(pillStyle.paddingTop) / fontScale,
        pillLineHeight: parseFloat(pillStyle.lineHeight) / fontScale,
        pillGap: parseFloat(getComputedStyle(pillGroup.querySelector("[data-nutrition-strip]")!).columnGap) / fontScale,
        thumbnailLeft: thumbnailBox.left - bounds.left, thumbnailWidth: thumbnailBox.width,
        thumbnailTop: thumbnailBox.top - bounds.top, thumbnailBottom: bounds.bottom - thumbnailBox.bottom, thumbnailHeight: thumbnailBox.height,
        imageLeft: imageBox.left - thumbnailBox.left, imageTop: imageBox.top - thumbnailBox.top,
        imageWidth: imageBox.width - thumbnailBox.width, imageHeight: imageBox.height - thumbnailBox.height,
        imageFit: getComputedStyle(image).objectFit, imagePosition: getComputedStyle(image).objectPosition,
        imageRadius: parseFloat(getComputedStyle(thumbnail).borderTopLeftRadius),
        actionsRight: bounds.right - actionsBox.right, summaryWidth: summaryBox.width, summaryGap: actionsBox.left - summaryBox.right,
        stripWrap: getComputedStyle(pillGroup.querySelector("[data-nutrition-strip]")!).flexWrap,
        pillLines: new Set([...pillGroup.querySelectorAll("[data-nutrition-metric]")].map(pill => pill.getBoundingClientRect().top)).size,
        nestedScroller: Boolean(pillGroup.closest("button")),
        macros: [...summary.querySelectorAll<HTMLElement>('[data-nutrition-metric]:not([data-nutrition-metric="calories"])')].map(pill => ({
          visible: [...pill.querySelectorAll<HTMLElement>('[aria-hidden="true"]')].filter(span => getComputedStyle(span).display !== "none").map(span => span.textContent).join(""),
          accessible: pill.querySelector(".sr-only")?.textContent,
        })) };
    });
  });
  expect(meals).toHaveLength(3);
  for (const row of meals) {
    expect(Math.abs(row.left - (mobile ? 0 : row.inset))).toBeLessThanOrEqual(1);
    expect(Math.abs(row.right - (mobile ? 0 : row.inset))).toBeLessThanOrEqual(1);
    if (mobile) {
      expect(row.radius).toBe(0); expect(row.contentInset).toBe(row.inset);
    } else { expect(row.radius).toBeGreaterThan(0); }
    expect(row.padding).toBe(0);
    expect(Math.abs(row.thumbnailLeft - 10)).toBeLessThanOrEqual(1);
    expect(Math.abs(row.thumbnailTop - 10)).toBeLessThanOrEqual(1); expect(Math.abs(row.thumbnailBottom - 10)).toBeLessThanOrEqual(1);
    expect(row.thumbnailWidth).toBe(40 + row.contentInset - 10); expect(row.thumbnailHeight).toBeGreaterThanOrEqual(40);
    expect(Math.abs(row.summaryLeft - (40 + row.contentInset + 8))).toBeLessThanOrEqual(1);
    expect(Math.abs(row.summaryRight - (row.contentInset + 92 + 8))).toBeLessThanOrEqual(1);
    for (const delta of [row.imageLeft, row.imageTop, row.imageWidth, row.imageHeight]) expect(Math.abs(delta)).toBeLessThanOrEqual(1);
    expect(row.imageFit).toBe("cover"); expect(row.imagePosition).toBe("50% 50%");
    expect(row.imageRadius).toBe(row.radius);
    expect(Math.abs(row.actionsRight - row.contentInset)).toBeLessThanOrEqual(1);
    expect(row.summaryWidth).toBeGreaterThan(0); expect(row.summaryGap).toBe(8);
    expect(Math.abs(row.actionCenter)).toBeLessThanOrEqual(1);
    expect(row.serving).toBe("1 serving");
    if (row.statusLabel?.startsWith("Planned meal:")) for (const text of row.pillTexts) { expect(text).not.toContain("≈"); expect(text).not.toMatch(/\d+\.\d+/); }
    expect(row.statusLabel).toMatch(/^(?:Planned meal|Eaten meal|Skipped planned meal): .+/);
    expect(row.routineCaptions).toBe(0);
    expect(row.stripWrap).toBe("nowrap"); expect(row.pillLines).toBe(1); expect(row.nestedScroller).toBe(false);
    expect(row.pillHorizontal).toBe(mobile ? 8 : 10); expect(row.pillVertical).toBe(4);
    expect(row.pillLineHeight).toBe(mobile ? 16 : 20); expect(row.pillGap).toBe(mobile ? 4 : 6);
    expect(row.macros).toHaveLength(3);
    for (const macro of row.macros) {
      expect(macro.visible).toMatch(mobile ? /^[PCF] ≈?\d+(?:\.\d+)?g$/ : /^≈?\d+(?:\.\d+)? g (?:protein|carbs|fat)$/);
      expect(macro.accessible).toMatch(/^(?:Protein|Carbs|Fat): (?:approximately )?\d+(?:\.\d+)? grams$/);
    }
  }
  const library = await recipes.evaluate(parent => {
    const outer = parent.getBoundingClientRect(), inset = parseFloat(getComputedStyle(parent).paddingLeft);
    const collection = parent.querySelector('[aria-label="Recipe collection"]')!.getBoundingClientRect();
    return { left: collection.left - outer.left, right: outer.right - collection.right, inset,
      cards: [...parent.querySelectorAll(".recipe-card")].map(card => {
        const bounds = card.getBoundingClientRect(), style = getComputedStyle(card);
        const cover = card.querySelector('[aria-label^="View recipe image:"]')!;
        const coverBounds = cover.getBoundingClientRect();
        const title = card.querySelector('[aria-label^="View recipe:"]')!.getBoundingClientRect();
        return { left: bounds.left - outer.left, right: outer.right - bounds.right,
          radius: parseFloat(style.borderTopLeftRadius), hasShadow: style.boxShadow !== "none" && style.boxShadow.split(/,(?![^(]*\))/).some(shadow => !shadow.includes("rgba(0, 0, 0, 0)")),
          divider: parseFloat(style.borderBottomWidth), coverHeight: coverBounds.height,
          coverInset: coverBounds.left - bounds.left, coverWidth: coverBounds.width,
          width: bounds.width, coverRadius: parseFloat(getComputedStyle(cover).borderTopLeftRadius),
          titleInset: title.left - bounds.left };
      }) };
  });
  expect(library.cards.length).toBeGreaterThan(1);
  expect(Math.abs(library.left - (mobile ? 0 : library.inset))).toBeLessThanOrEqual(1);
  expect(Math.abs(library.right - (mobile ? 0 : library.inset))).toBeLessThanOrEqual(1);
  for (const card of library.cards) {
    if (mobile) {
      expect(Math.abs(card.left)).toBeLessThanOrEqual(1); expect(Math.abs(card.right)).toBeLessThanOrEqual(1);
      expect(card.radius).toBe(0); expect(card.hasShadow).toBe(false); expect(card.divider).toBe(1);
      expect(card.coverHeight).toBe(156); expect(card.coverRadius).toBe(0);
      expect(card.coverInset).toBe(0); expect(Math.abs(card.coverWidth - card.width)).toBeLessThanOrEqual(1);
      expect(card.titleInset).toBe(library.inset);
    } else {
      expect(card.radius).toBeGreaterThan(0); expect(card.hasShadow).toBe(true);
      expect(card.divider).toBe(0); expect(card.coverRadius).toBeGreaterThan(0); expect(card.coverInset).toBe(16);
    }
  }
  const pageWidth = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, scale: visualViewport?.scale, font: getComputedStyle(document.documentElement).fontSize,
    offenders: [...document.querySelectorAll<HTMLElement>("body *")].filter(element => {
      if (element.getBoundingClientRect().right <= innerWidth + 1) return false;
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) if (["auto", "hidden", "scroll"].includes(getComputedStyle(parent).overflowX)) return false;
      return true;
    }).slice(0, 8).map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right, text: element.textContent?.slice(0, 70) })) }));
  expect(pageWidth.scroll, JSON.stringify(pageWidth)).toBeLessThanOrEqual(pageWidth.width + 1);
}

test("Nutrition flat panels align on mobile and restore inset cards at 640px", async ({ browser }, info) => {
  test.setTimeout(300_000);
  const accounts: LocalAccount[] = [];
  const setup = async (name: string) => {
    const account = await createLocalAccount("nutrition-flat"); accounts.push(account);
    const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await client.auth.signInWithPassword(account);
    if (login.error || !login.data.user) throw login.error;
    const repository = createSupabaseRepository(client);
    const profile: UserProfile = { id: login.data.user.id, name, age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [], notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
    await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: crypto.randomUUID() });
    return { account, repository, group: cookingGroupRepository(client) };
  };
  let context: Awaited<ReturnType<typeof createAuthenticatedContext>> | undefined;
  try {
    const owner = await setup("Flat Owner"), member = await setup("Flat Member");
    const sharedName = "Shared chicken with vegetables and a deliberately long recipe name";
    await member.repository.saveRecipe({ currentSnapshot: (await member.repository.load())!, newFoods: [], idempotencyKey: crypto.randomUUID(),
      meal: { id: "flat-shared-recipe", name: sharedName, notes: "Cook the eggs thoroughly and serve.", servings: 2, mealSlots: ["dinner"], complexity: "easy", totalTimeMinutes: 35, ingredients: [{ foodId: "food-egg", servings: 2 }] } });
    const snapshot = (await owner.repository.load())!, date = todayKey();
    const recipe = snapshot.savedMeals.find(meal => meal.id === "meal-korean-beef-bowl")!;
    await owner.repository.editMealPlan({ currentSnapshot: snapshot, mealPlan: { ...snapshot.mealPlan!, meals: [
      { id: "flat-planned", date, slot: "breakfast", mealId: recipe.id, label: "Planned chicken with vegetables and a deliberately long meal name", servings: 1 },
    ] }, idempotencyKey: crypto.randomUUID() });
    await owner.repository.saveSavedMealLog({ date, slot: "lunch", meal: recipe, recipeServings: 1,
      entries: [providedRecipeLogEntry(recipe, 1, date, "lunch")!], idempotencyKey: crypto.randomUUID() });
    await owner.repository.saveNutrition({ entry: { date, slot: "dinner", customName: "Standalone dinner", servings: 1, calories: 200, proteinG: 10, carbsG: 20, fatG: 9, estimated: false, confidence: "high", source: "user", valueSource: "user_provided" }, idempotencyKey: crypto.randomUUID() });
    const invite = await owner.group.command({ action: "invite", grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: crypto.randomUUID() });
    const review = await member.group.command({ action: "inspect-pin", pin: invite.pin! });
    await member.group.command({ action: "join", grocerySharingAcknowledgment: "all-weeks-v1", pin: invite.pin!, groupRevision: review.group!.revision, idempotencyKey: crypto.randomUUID() });
    context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, owner.account);
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/nutrition");
    const planned = page.getByRole("region", { name: "Planned", exact: true });
    const recipes = page.getByRole("region", { name: "Recipes", exact: true });
    await expect(planned.getByRole("button", { name: "Undo logged Standalone dinner", exact: true })).toBeVisible();
    await expect(planned.getByRole("button", { name: /^Edit/ })).toHaveCount(0);
    await expect(planned.getByText("mixed sources", { exact: true })).toHaveCount(0);
    await expect(recipes.getByRole("button", { name: `View recipe: ${sharedName}`, exact: true })).toBeVisible();
    const standaloneRow = planned.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Undo logged Standalone dinner", exact: true }) });
    await expect(standaloneRow.locator("[data-meal-thumbnail] img")).toHaveAttribute("src", /recipe-default\.png$/);
    const recipeImage = planned.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Undo logged ${recipe.name}`, exact: true }) }).locator("[data-meal-thumbnail] img");
    const coverSource = await recipeImage.getAttribute("src");
    expect(coverSource).not.toMatch(/recipe-default\.png$/);
    await page.route(`**${coverSource}`, route => route.abort());
    await page.reload(); await page.waitForLoadState("networkidle");
    await expect(recipeImage).toHaveAttribute("src", /recipe-default\.png$/);
    await page.unroute(`**${coverSource}`); await page.reload(); await page.waitForLoadState("networkidle");
    await expect(recipeImage).toHaveAttribute("src", coverSource!);

    for (const width of [320, 385, 408, 445, 639, 640, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      for (const enlarged of [false, true]) {
        const text = enlarged ? await page.addStyleTag({ content: "html { font-size: 200% !important; }" }) : null;
        await expectPanelGeometry(page, planned, recipes, width < 640);
        for (const strip of await planned.locator("[data-meal-summary]").getByRole("group").all()) {
          const overflows = await strip.evaluate(element => element.scrollWidth > element.clientWidth + 1);
          if (overflows) {
            await expect(strip).toHaveAttribute("tabindex", "0");
            await strip.focus(); await strip.press("End");
            await expect.poll(() => strip.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
            await strip.press("Home");
          } else await expect(strip).not.toHaveAttribute("tabindex");
        }

        if (width < 640) {
          const details = recipes.locator(".recipe-card").first().getByRole("group", { name: "Recipe details", exact: true });
          const overflows = await details.evaluate(element => element.scrollWidth > element.clientWidth + 1);
          if (overflows) {
            await expect(details).toHaveAttribute("tabindex", "0");
            expect(await details.evaluate(element => { element.scrollLeft = element.scrollWidth; return element.scrollLeft > 0; })).toBe(true);
          }
        }
        if (width === 1440 && !enlarged) await recipes.locator(".recipe-card").first().screenshot({ path: `output/nutrition-flat-panels/recipe-wide-${info.project.name}.png` });
        if (text) await text.evaluate(element => element.parentNode?.removeChild(element));
      }
    }
    await page.setViewportSize({ width: 385, height: 930 });
    const grouped = planned.getByRole("listitem").filter({ has: page.getByRole("button", { name: `Undo logged ${recipe.name}`, exact: true }) });
    const recipeTrigger = grouped.getByRole("button", { name: `View recipe: ${recipe.name}`, exact: true });
    await expect(recipeTrigger).not.toHaveAttribute("aria-expanded");
    await recipeTrigger.focus(); await recipeTrigger.press("Enter");
    const entryOverview = page.getByRole("dialog", { name: "Recipe overview", exact: true });
    await expect(entryOverview.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(entryOverview.getByRole("button", { name: "Save personal copy", exact: true })).toHaveCount(0);
    await expect(entryOverview.getByText(/Your logged values remain as recorded/)).toBeVisible();
    for (const tab of ["Ingredients", "Instructions", "Details"]) {
      await entryOverview.getByRole("tab", { name: tab, exact: true }).click();
      await expect(entryOverview.getByRole("tabpanel", { name: tab, exact: true })).toBeVisible();
    }
    await page.keyboard.press("Escape"); await expect(recipeTrigger).toBeFocused();
    const standaloneDetails = planned.getByRole("button", { name: "View recorded details: Standalone dinner", exact: true });
    await standaloneDetails.click();
    const recordedModal = page.getByRole("dialog", { name: "Recorded meal details", exact: true });
    await expect(recordedModal.getByRole("group", { name: "Recorded portion nutrition", exact: true })).toContainText("200 kcal");
    await expect(recordedModal.locator("input, select, textarea")).toHaveCount(0);
    for (const width of [320, 408, 640, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      const text = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      expect(await recordedModal.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await text.evaluate(element => element.parentNode?.removeChild(element));
    }
    await page.setViewportSize({ width: 385, height: 930 });
    await recordedModal.getByRole("button", { name: "Close", exact: true }).click(); await expect(standaloneDetails).toBeFocused();
    const plannedView = planned.getByRole("button", { name: "View recipe: Planned chicken with vegetables and a deliberately long meal name", exact: true });
    await plannedView.click(); await expect(entryOverview.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await entryOverview.getByRole("button", { name: "Close", exact: true }).click(); await expect(plannedView).toBeFocused();
    const libraryView = recipes.getByRole("button", { name: `View recipe: ${recipe.name}`, exact: true });
    await libraryView.click(); await expect(entryOverview.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await entryOverview.getByRole("button", { name: "Close", exact: true }).click(); await expect(libraryView).toBeFocused();
    const shared = recipes.getByRole("button", { name: `View recipe: ${sharedName}`, exact: true });
    await shared.focus(); await shared.press("Enter");
    await expect(entryOverview.getByRole("button", { name: "Save personal copy", exact: true })).toBeVisible();
    await page.getByRole("dialog", { name: "Recipe overview", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
    await expect(shared).toBeFocused();
    const mint = grouped.getByRole("button", { name: `Undo logged ${recipe.name}`, exact: true });
    const mintShape = await mint.evaluate(element => ({ width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height, radius: parseFloat(getComputedStyle(element).borderTopLeftRadius), directIcon: element.firstElementChild?.tagName.toLowerCase() === "svg" }));
    expect(mintShape.width).toBe(44); expect(mintShape.height).toBe(44); expect(mintShape.radius).toBeGreaterThanOrEqual(22); expect(mintShape.directIcon).toBe(true);

    // Legacy measurements require a refresh; the retry must retain the entry's read-only mode.
    let recipeReadMode: "legacy" | "failed" | "ready" = "legacy";
    await page.route("**/rest/v1/meals?*", async route => {
      if (route.request().method() !== "GET") return route.continue();
      if (recipeReadMode === "failed") return route.fulfill({ status: 503, json: { message: "Recipe read fixture unavailable" } });
      const response = await route.fetch(); const data = await response.json();
      if (!Array.isArray(data)) return route.fulfill({ response });
      return route.fulfill({ response, json: data.map((row: Database["public"]["Tables"]["meals"]["Row"]) => row.app_id === recipe.id && recipeReadMode === "legacy" ? { ...row, nutrition_notes: null } : row) });
    });
    await page.reload(); await page.waitForLoadState("networkidle"); await expect(plannedView).toBeEnabled();
    recipeReadMode = "failed"; await plannedView.click();
    const recipeRetry = page.getByRole("button", { name: "Retry recipe", exact: true });
    await expect(recipeRetry).toBeVisible();
    recipeReadMode = "ready"; await recipeRetry.click();
    await expect(entryOverview).toBeVisible(); await expect(entryOverview.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await entryOverview.getByRole("button", { name: "Close", exact: true }).click(); await expect(plannedView).toBeFocused();
    await page.unroute("**/rest/v1/meals?*");

    // Missing and AI-assisted recipe references expose saved log data rather than fabricated recipes.
    await page.route("**/rest/v1/rpc/get_nutrition_week", async route => {
      const response = await route.fetch(); const data = await response.json();
      return route.fulfill({ response, json: { ...data, loggedMeals: data.loggedMeals.map((row: Database["public"]["Tables"]["logged_meals"]["Row"]) => row.log_date === date && row.meal_slot === "lunch" ? { ...row, meal_row_id: null, source_mode: "ai_assisted", recipe_servings: null } : row) } });
    });
    await page.reload(); await page.waitForLoadState("networkidle");
    const missingRecipe = grouped.getByRole("button", { name: `View recorded details: ${recipe.name}`, exact: true });
    await expect(grouped.locator("[data-meal-serving]")).toHaveText("Servings not recorded");
    await expect(missingRecipe).toBeVisible(); await missingRecipe.focus(); await expect(missingRecipe).toBeEnabled(); await missingRecipe.press("Enter");
    await expect(recordedModal.getByRole("group", { name: "Recorded portion nutrition", exact: true })).toContainText("560 kcal");
    await expect(recordedModal.getByText("Recorded ingredients and portions", { exact: true })).toBeVisible();
    await expect(recordedModal.locator("input, select, textarea")).toHaveCount(0);
    await page.keyboard.press("Escape"); await expect(missingRecipe).toBeFocused();
    await page.unroute("**/rest/v1/rpc/get_nutrition_week"); await page.reload(); await page.waitForLoadState("networkidle"); await expect(recipeTrigger).toBeVisible();
    for (const action of await planned.getByRole("button", { name: /^(Log planned|Remove planned|Undo logged|Delete)/ }).all()) {
      const bounds = await action.boundingBox(); expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await planned.screenshot({ path: `output/nutrition-flat-panels/meals-${info.project.name}.png` });
    await recipes.locator(".recipe-card").first().screenshot({ path: `output/nutrition-flat-panels/recipe-${info.project.name}.png` });
    await recipes.getByRole("button", { name: "Filter recipes", exact: true }).click();
    const filters = page.getByRole("dialog", { name: "Filter recipes", exact: true });
    await filters.getByRole("searchbox", { name: "Recipe name", exact: true }).fill("no-matching-flat-panel-recipe");
    await filters.getByRole("button", { name: "Apply filters", exact: true }).click();
    const empty = recipes.getByText("No recipes match these filters.", { exact: true });
    await expect(empty).toBeVisible();
    expect(await empty.evaluate(element => {
      const bounds = document.createRange(); bounds.selectNodeContents(element);
      return bounds.getBoundingClientRect().left - element.closest('[aria-labelledby="saved-meals-heading"]')!.getBoundingClientRect().left;
    })).toBe(20);
    await recipes.getByRole("button", { name: "Clear filters", exact: true }).click();
    let releaseLoading!: () => void;
    const loading = new Promise<void>(resolve => { releaseLoading = resolve; });
    await page.route("**/rest/v1/rpc/get_cooking_group_week", async route => { await loading; await route.continue(); });
    await page.reload();
    const loadingMessage = recipes.getByText("Loading shared recipes…", { exact: true });
    try {
      await expect(loadingMessage).toBeVisible();
      expect(await loadingMessage.evaluate(element => parseFloat(getComputedStyle(element).paddingLeft))).toBe(20);
    } finally { releaseLoading(); }
    await expect(shared).toBeVisible();
    await page.unroute("**/rest/v1/rpc/get_cooking_group_week");
    await page.route("**/rest/v1/rpc/get_cooking_group_week", route => route.fulfill({ status: 503, json: { message: "Temporary fixture failure" } }));
    await page.reload(); await page.waitForLoadState("networkidle");
    const retry = recipes.getByRole("button", { name: "Retry shared recipes", exact: true });
    await expect(retry).toBeVisible();
    const errorInset = await retry.evaluate(element => element.getBoundingClientRect().left - element.closest('[aria-labelledby="saved-meals-heading"]')!.getBoundingClientRect().left);
    expect(errorInset).toBe(20);
    await page.unroute("**/rest/v1/rpc/get_cooking_group_week"); await retry.click();
    await expect(shared).toBeVisible();

    const independent = (await owner.repository.loadNutritionWeek(startOfWeek(date, 0))).loggedMeals.find(meal => meal.slot === "lunch")!;
    const undoGroup = grouped.getByRole("button", { name: `Undo logged ${recipe.name}`, exact: true });
    await expect(undoGroup).toBeVisible();
    const footerNames = await grouped.locator("[data-meal-actions]").getByRole("button").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label")));
    expect(footerNames).toEqual([`Undo logged ${recipe.name}`, `Delete ${recipe.name}`]);
    await expect(grouped.locator("svg.lucide-trash-2")).toHaveCount(0);
    await expect(grouped.getByRole("button", { name: `Delete ${recipe.name}`, exact: true }).locator("svg.lucide-x")).toBeVisible();
    let releaseUndo!: () => void;
    const heldUndo = new Promise<void>(resolve => { releaseUndo = resolve; });
    let failedUndoKey: string | undefined, undoRequests = 0;
    await page.route("**/rest/v1/rpc/delete_logged_meal", async route => {
      undoRequests++; failedUndoKey = route.request().postDataJSON().p_payload.idempotencyKey;
      await heldUndo; await route.abort("failed");
    });
    await undoGroup.focus(); await expect(undoGroup).toBeEnabled(); await undoGroup.press("Enter");
    try {
      await expect(undoGroup).toBeDisabled(); await expect(undoGroup).toHaveAttribute("aria-busy", "true");
      await expect(grouped.getByRole("button", { name: `Delete ${recipe.name}`, exact: true })).toBeDisabled();
      expect(undoRequests).toBe(1);
    } finally { releaseUndo(); }
    await expect(grouped.getByRole("alert")).toContainText("Your saved log is retained");
    await expect(undoGroup).toBeEnabled();
    expect((await owner.repository.loadNutritionWeek(startOfWeek(date, 0))).loggedMeals.some(meal => meal.id === independent.id)).toBe(true);
    await page.unroute("**/rest/v1/rpc/delete_logged_meal");
    const retried = page.waitForRequest("**/rest/v1/rpc/delete_logged_meal");
    await undoGroup.click();
    const retryPayload = (await retried).postDataJSON().p_payload;
    expect(retryPayload.idempotencyKey).toBe(failedUndoKey);
    expect(retryPayload.expectedVersions.recordRevision).toBe(independent.revision);
    await expect(undoGroup).toHaveCount(0); await expect(grouped).toHaveCount(0);
    await expect(page.locator("#add-meal-lunch")).toBeFocused();
    const afterGroupUndo = await owner.repository.loadNutritionWeek(startOfWeek(date, 0));
    expect(afterGroupUndo.loggedMeals.some(meal => meal.id === independent.id)).toBe(false);
    expect(afterGroupUndo.nutritionLogs.some(entry => entry.loggedMealId === independent.id)).toBe(false);

    await planned.getByRole("button", { name: "Undo logged Standalone dinner", exact: true }).click();
    await expect(planned.getByRole("button", { name: "Undo logged Standalone dinner", exact: true })).toHaveCount(0);
    await expect(page.locator("#add-meal-dinner")).toBeFocused();
    expect((await owner.repository.loadNutritionWeek(startOfWeek(date, 0))).nutritionLogs.some(entry => entry.customName === "Standalone dinner")).toBe(false);

    await owner.repository.saveNutrition({ entry: { date, slot: "dinner", customName: "Delete with X", servings: 0.5, calories: 125, proteinG: 7.5, carbsG: 12, fatG: 4, estimated: false, confidence: "high", source: "user", valueSource: "user_provided" }, idempotencyKey: crypto.randomUUID() });
    await page.reload(); await page.waitForLoadState("networkidle");
    const deleteWithX = planned.getByRole("button", { name: "Delete Delete with X", exact: true });
    await page.waitForLoadState("networkidle");
    await expect(deleteWithX).toBeVisible(); await expect(deleteWithX).toBeEnabled(); await deleteWithX.click();
    await expect(deleteWithX).toHaveCount(0); await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("#add-meal-dinner")).toBeFocused();
    expect((await owner.repository.loadNutritionWeek(startOfWeek(date, 0))).nutritionLogs.some(entry => entry.customName === "Delete with X")).toBe(false);

    const plannedRecipe = planned.getByRole("button", { name: "Log planned Planned chicken with vegetables and a deliberately long meal name", exact: true });
    await plannedRecipe.click();
    const linkedRecipeUndo = planned.getByRole("button", { name: `Undo logged ${recipe.name}`, exact: true });
    await expect(linkedRecipeUndo).toBeVisible(); await expect(plannedRecipe).toHaveCount(0);
    await expect(planned.getByRole("button", { name: `Delete ${recipe.name}`, exact: true })).toBeVisible();
    await planned.screenshot({ path: `output/nutrition-flat-panels/eaten-checkmark-${info.project.name}.png` });
    await linkedRecipeUndo.click();
    await expect(plannedRecipe).toBeVisible(); await expect(page.locator("#add-meal-breakfast")).toBeFocused();
    const current = (await owner.repository.load())!;
    await owner.repository.editMealPlan({ currentSnapshot: current, mealPlan: { ...current.mealPlan!, meals: [...current.mealPlan!.meals,
      { id: "flat-linked-food", date, slot: "snack", foodId: "food-egg", label: "Linked egg", servings: 1 },
    ] }, idempotencyKey: crypto.randomUUID() });
    await page.reload(); await page.waitForLoadState("networkidle");
    const plannedFood = planned.getByRole("button", { name: "Log planned Linked egg", exact: true });
    await plannedFood.focus(); await expect(plannedFood).toBeEnabled(); await plannedFood.press("Enter");
    const foodUndo = planned.getByRole("button", { name: "Undo logged Egg", exact: true });
    await expect(foodUndo).toBeVisible(); await expect(plannedFood).toHaveCount(0);
    await foodUndo.click(); await expect(plannedFood).toBeVisible(); await expect(page.locator("#add-meal-snack")).toBeFocused();

    const removeFood = planned.getByRole("button", { name: "Remove planned Linked egg", exact: true });
    await removeFood.click();
    const removal = page.getByRole("dialog", { name: "Remove planned meal?", exact: true });
    await expect(removal.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await removal.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(removeFood).toBeFocused();
    await removeFood.click(); await removal.getByRole("button", { name: "Remove meal", exact: true }).click();
    await expect(removeFood).toHaveCount(0); await expect(page.locator("#add-meal-snack")).toBeFocused();

    const retainedName = "Archived recipe retained by the plan";
    await owner.repository.saveRecipe({ currentSnapshot: (await owner.repository.load())!, newFoods: [], idempotencyKey: crypto.randomUUID(),
      meal: { id: "flat-retained-recipe", name: retainedName, notes: "Cook the egg thoroughly and serve.", servings: 1, mealSlots: ["dinner"], totalTimeMinutes: 15, complexity: "easy", ingredients: [{ foodId: "food-egg", servings: 1 }] } });
    const withRetained = (await owner.repository.load())!;
    await owner.repository.editMealPlan({ currentSnapshot: withRetained, mealPlan: { ...withRetained.mealPlan!, meals: [...withRetained.mealPlan!.meals,
      { id: "flat-retained-plan", date, slot: "dinner", mealId: "flat-retained-recipe", label: retainedName, servings: 1 },
    ] }, idempotencyKey: crypto.randomUUID() });
    await owner.repository.archiveMeal({ mealId: "flat-retained-recipe", currentSnapshot: (await owner.repository.load())!, idempotencyKey: crypto.randomUUID() });
    await page.reload(); await page.waitForLoadState("networkidle");
    const retained = planned.getByRole("button", { name: `View recipe: ${retainedName}`, exact: true });
    await expect(retained).toBeVisible(); await retained.click();
    await expect(entryOverview.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await entryOverview.getByRole("button", { name: "Close", exact: true }).click(); await expect(retained).toBeFocused();

    const previousDate = addDays(date, -14), previousWeek = startOfWeek(previousDate, 0);
    await owner.repository.saveSavedMealLog({ date: previousDate, slot: "lunch", meal: recipe, recipeServings: 1,
      entries: [providedRecipeLogEntry(recipe, 1, previousDate, "lunch")!], idempotencyKey: crypto.randomUUID() });
    await page.getByRole("button", { name: "Previous week", exact: true }).click();
    await expect(page.getByRole("button", { name: "Previous week", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Previous week", exact: true }).click();
    const previousUndo = planned.getByRole("button", { name: `Undo logged ${recipe.name}`, exact: true });
    await expect(previousUndo).toBeVisible(); await previousUndo.click(); await expect(previousUndo).toHaveCount(0);
    await expect(page.locator("#add-meal-lunch")).toBeFocused();
    await expect(page.getByRole("group", { name: "Choose a day", exact: true }).getByRole("button", { name: formatFullDate(previousDate), exact: true })).toHaveAttribute("aria-pressed", "true");
    expect((await owner.repository.loadNutritionWeek(previousWeek)).loggedMeals.filter(meal => meal.date === previousDate)).toHaveLength(0);

    await owner.repository.saveNutrition({ entry: { date, slot: "dinner", customName: "Home parity food", servings: 1, calories: 200, proteinG: 10, carbsG: 20, fatG: 9, estimated: false, confidence: "high", source: "user", valueSource: "user_provided" }, idempotencyKey: crypto.randomUUID() });
    await page.goto("/");
    const homeUndo = page.getByRole("region", { name: "Today's meals", exact: true }).getByRole("button", { name: "Undo logged Home parity food", exact: true });
    await expect(homeUndo).toBeVisible(); await homeUndo.click(); await expect(homeUndo).toHaveCount(0);
    await expect(page.locator("#home-add-meal-dinner")).toBeFocused();
  } finally {
    await context?.close();
    for (const account of accounts.reverse()) await deleteLocalAccount(account);
  }
});
