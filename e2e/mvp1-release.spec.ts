import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";

const userAState = path.resolve("playwright/.auth/user-a.json");
const userBState = path.resolve("playwright/.auth/user-b.json");
const authenticated = fs.existsSync(userAState);
const secondAccountAvailable = fs.existsSync(userBState);

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

test.describe("MVP-1 release browser gate", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!authenticated, "Authenticated storage state was not prepared from the confirmed test account variables.");
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
    await page.goto("/settings");
    const jsonPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const jsonDownload = await jsonPromise;
    expect(jsonDownload.suggestedFilename()).toMatch(/^calicoach-export-.*\.json$/);
    const jsonPath = await jsonDownload.path();
    expect(jsonPath).toBeTruthy();
    const jsonExport = JSON.parse(fs.readFileSync(jsonPath!, "utf8")) as { loggedMeals?: unknown };
    expect(jsonExport).toHaveProperty("loggedMeals");

    const zipPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV bundle" }).click();
    const zipDownload = await zipPromise;
    expect(zipDownload.suggestedFilename()).toMatch(/^calicoach-export-.*\.zip$/);
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
      test.skip(await increase.count() === 0 || await competingIncrease.count() === 0, "The retained test account has no grocery item for a stale-edit scenario.");
      await increase.click();
      await expect(page.getByText(/adjusted by you/i).first()).toBeVisible();

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
    test.skip(!secondAccountAvailable, "User B storage state is not available.");
    await page.goto("/nutrition");
    await expect(page.getByText("Fried Rice with 2 Eggs")).toBeVisible();

    const userBContext: BrowserContext = await browser.newContext({ storageState: userBState, serviceWorkers: "block" });
    const userBPage = await userBContext.newPage();
    try {
      await userBPage.goto("/nutrition");
      await expect(userBPage.getByText("Fried Rice with 2 Eggs")).not.toBeVisible();
      await expect(userBPage.getByRole("heading", { name: "Nutrition" })).toBeVisible();
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
});
