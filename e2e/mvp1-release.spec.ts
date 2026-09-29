import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
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
  await page.getByRole("heading", { name: slot }).locator("..").getByRole("button", { name: "Add" }).click();
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
  await sessionLink.click({ force: true });
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
  await page.getByRole("textbox", { name: "Search for a food or describe a meal" }).fill("egg");
  await page.getByRole("button", { name: /^Egg/ }).first().click();
  await expect(page.getByRole("group", { name: "Review food quantity" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm food" }).click();
  await expect(page.locator("li").filter({ hasText: /Egg/ }).first()).toBeVisible();
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
    const customItem = `Journey item ${testInfo.project.name}`;
    await journeyPage.getByRole("textbox", { name: "Custom item name" }).fill(customItem);
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
    const field = page.getByRole("textbox", { name: "Search for a food or describe a meal" });
    await field.fill("e");
    await expect(field).toBeFocused();
    await field.type("gg");
    await expect(field).toHaveValue("egg");
    await expect(field).toBeFocused();
    await page.getByRole("button", { name: /^Egg/ }).first().click();
    await expect(page.getByRole("group", { name: "Review food quantity" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm food" })).toBeVisible();
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
    const field = page.getByRole("textbox", { name: "Search for a food or describe a meal" });
    await field.fill("2 cups fried rice with 2 eggs");
    await expect(page.getByText(/sent to DeepSeek only when you choose Analyze this meal/i)).toBeVisible();
    expect(extractionCalls).toBe(0);
    await page.getByRole("button", { name: "Analyze this meal" }).click();
    await expect(page.getByRole("region", { name: "Guided meal review" })).toBeVisible();
    expect(extractionCalls).toBe(1);
  });

  test("supports an explicit low-confidence AI estimate range", async ({ page }) => {
    await openNutritionSlot(page, "Dinner");
    await mockMealProvider(page, { includeEstimate: true });
    await page.getByRole("textbox", { name: "Search for a food or describe a meal" }).fill("2 cups fried rice with 2 eggs");
    await page.getByRole("button", { name: "Analyze this meal" }).click();
    await expect(page.getByRole("region", { name: "Guided meal review" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Include cooking oil" }).check();
    await page.getByRole("button", { name: "Estimate selected unresolved" }).click();
    await expect(page.getByText(/AI estimate · low confidence · range 90–130 kcal/)).toBeVisible();
    await expect(page.getByText(/Catalog values are authoritative/i)).toBeVisible();
  });

  test("retains the meal description when the provider fails", async ({ page }) => {
    await openNutritionSlot(page, "Snack");
    await page.route("**/functions/v1/nutrition-text-parse", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "provider_unavailable" }),
    }));
    const description = "provider failure test meal";
    await page.getByRole("textbox", { name: "Search for a food or describe a meal" }).fill(description);
    await page.getByRole("button", { name: "Analyze this meal" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Meal analysis is unavailable" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Search for a food or describe a meal" })).toHaveValue(description);
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
    const nameField = page.getByRole("textbox", { name: "Custom item name" });
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
