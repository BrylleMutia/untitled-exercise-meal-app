import { selectBirthday } from "./birth-date";
import { test, expect, type Page } from "@playwright/test";
import { createAuthenticatedContext, createLocalAccount, deleteLocalAccount } from "./local-account";

test.setTimeout(180_000);

async function checkHelp(page: Page, title: string, label = `About ${title}`) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await dialog.getByRole("button", { name: `Close ${title} help`, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function checkSummaryAlignment(page: Page) {
  for (const name of ["Workouts", "Steps"]) {
    const summary = page.getByRole("region", { name, exact: true }).locator("[data-activity-summary]");
    const geometry = await summary.evaluate(element => {
      const circle = element.querySelector("svg")!.getBoundingClientRect(), metrics = element.querySelector("dl")!.getBoundingClientRect();
      return { center: Math.abs(circle.top + circle.height / 2 - metrics.top - metrics.height / 2), side: circle.right <= metrics.left };
    });
    expect(geometry.center).toBeLessThanOrEqual(2); expect(geometry.side).toBe(true);
  }
}
async function checkWorkoutPlacement(page: Page, width: number) {
  const meals = page.getByRole("region", { name: "Today's meals", exact: true });
  const workout = page.getByRole("region", { name: "Workouts", exact: true });
  const steps = page.getByRole("region", { name: "Steps", exact: true });
  await expect(workout).toHaveCount(1);
  const mealBox = (await meals.boundingBox())!, workoutBox = (await workout.boundingBox())!, stepsBox = (await steps.boundingBox())!;
  if (width >= 1024) { expect(workoutBox.x).toBeGreaterThan(mealBox.x); expect(workoutBox.y).toBeCloseTo(mealBox.y, 0); }
  else expect(workoutBox.y).toBeGreaterThanOrEqual(mealBox.y + mealBox.height);
  expect(stepsBox.y).toBeGreaterThanOrEqual(workoutBox.y + workoutBox.height);
  await expect(page.locator('[id="home-workouts-heading"]')).toHaveCount(1);
  for (const link of await workout.getByRole("link").all()) {
    const box = (await link.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
  }
}

test("help supports previews, pinning, dismissal, focus and one open panel", async ({ page }, testInfo) => {
  await page.goto("/activity");
  const trigger = page.getByRole("button", { name: "About Daily steps", exact: true });
  const dialog = page.getByRole("dialog", { name: "Daily steps", exact: true });
  if (!testInfo.project.use.isMobile) {
    await trigger.hover();
    await expect(dialog).toBeVisible();
    await expect(trigger).not.toBeFocused();
    await dialog.hover();
    await expect(dialog).toBeVisible();
    await trigger.click();
  } else {
    await trigger.tap();
  }
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await page.mouse.move(1, 1);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.waitForTimeout(400);
  await expect(dialog).toHaveCount(0);

  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeFocused();
  await dialog.getByRole("button", { name: "Close Daily steps help", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(dialog).toHaveCount(0);

  await trigger.click();
  const second = page.getByRole("button", { name: "About Walking energy", exact: true });
  await second.click();
  await expect(dialog).toHaveCount(0);
  const progressHelp = page.getByRole("dialog", { name: "Walking energy", exact: true });
  await expect(progressHelp).toBeVisible();
  const source = progressHelp.getByRole("link", { name: "Walking estimate source" });
  await expect(source).toHaveAttribute("href", "https://pacompendium.com/walking/");
  await page.keyboard.press("Tab");
  await expect(progressHelp.getByRole("button", { name: "Close Walking energy help" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(source).toBeFocused();
  await second.click();
  await expect(progressHelp).toHaveCount(0);

  await trigger.click();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("help fits desktop, mobile and enlarged text without hiding essential states", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const width of [320,390,547,760,1024,1440]) {
    await page.setViewportSize({ width, height: 930 });
    for (const enlarged of [false,true]) {
      const style = enlarged ? await page.addStyleTag({ content: "html { font-size: 200% !important; }" }) : null;
      await checkWorkoutPlacement(page,width); await checkSummaryAlignment(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const name of ["Today's meals","Workouts","Steps"]) await expect(page.getByRole("button", { name: `About ${name}`, exact: true })).toHaveCount(0);
      if (style) await style.evaluate(element => element.parentNode?.removeChild(element));
    }
  }
  await page.getByRole("link", { name: "View weekly workouts", exact: true }).focus();
  await page.keyboard.press("Enter"); await expect(page).toHaveURL(/\/workouts$/);
  await page.goto("/");
  await page.getByRole("region", { name: "Steps", exact: true }).getByRole("button", { name: /^(Add|Edit) steps for/ }).last().click();
  const modal = page.getByRole("dialog", { name: /^(Add|Edit) steps$/ });
  await expect(modal.getByLabel("Steps", { exact: true })).toBeEnabled();
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.screenshot({ path: `test-results/activity-home-${testInfo.project.name}.png`, fullPage: true });
});

test("workout stack fits long scheduled content and missing meal targets", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const title = "Full-body strength, balance and controlled movement practice";
  const focus = "Chest, shoulders, back, legs and core with comfortable controlled repetitions";
  let workoutId = "";
  await page.route("**/rest/v1/planned_workouts?*", async (route) => {
    const response = await route.fetch();
    const rows = await response.json() as Array<{ app_id: string; day_of_week: number; title: string; focus: string }>;
    expect(rows.length).toBeGreaterThan(0);
    workoutId = rows[0].app_id;
    const day = new Date().getDay();
    await route.fulfill({ response, json: rows.map((row, index) => index === 0
      ? { ...row, day_of_week: day, title, focus }
      : { ...row, day_of_week: (day + 1) % 7 }) });
  });
  await page.route("**/rest/v1/daily_targets?*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: [] });
  });
  await page.route("**/rest/v1/rpc/get_nutrition_week", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), targets: [] } });
  });
  // The initial snapshot is server-rendered. Intercept a preference action to
  // trigger the client read path without forwarding any write to the database.
  await page.route("**/rest/v1/rpc/update_units", (route) => route.fulfill({ status: 200, json: { status: "completed", operation: "update_units", result_refs: {} } }));
  await page.goto("/settings");
  await page.getByRole("button", { name: "Imperial", exact: true }).click();
  await expect.poll(() => workoutId).not.toBe("");
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page.getByRole("region", { name: "Today's workout", exact: true }).getByText(title, { exact: true })).toBeVisible();
  const sizes = testInfo.project.use.isMobile
    ? [{ width: 390, height: 844 }, { width: 320, height: 844 }]
    : [{ width: 1024, height: 930 }, { width: 1103, height: 930 }, { width: 1440, height: 900 }];
  for (const viewport of sizes) {
    await page.setViewportSize(viewport);
    const workout = page.getByRole("region", { name: "Today's workout", exact: true });
    await expect(workout.getByText(title, { exact: true })).toBeVisible();
    await expect(workout).toContainText(focus);
    await expect(workout.getByRole("link", { name: "Start workout", exact: true })).toHaveAttribute("href", `/workouts/session/${workoutId}`);
    await expect(page.getByText("Daily targets aren't set yet. You can still log meals.", { exact: true })).toBeVisible();
    await checkWorkoutPlacement(page, viewport.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/workout-stack-long-${testInfo.project.name}-${viewport.width}.png`, fullPage: true });
  }
  await page.addStyleTag({ content: "html { font-size: 24px !important; }" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("24px");
  await checkWorkoutPlacement(page, sizes.at(-1)!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("help covers onboarding, settings, editors and workout logging without submitting drafts", async ({ browser }, testInfo) => {
  const account = await createLocalAccount(`help-${testInfo.project.name}`);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  try {
    const page = await context.newPage();
    await page.setViewportSize(testInfo.project.use.viewport!);
    await page.goto("/onboarding");
    await page.getByLabel("What should we call you?").fill("Help Test");
    await selectBirthday(page, 30);
    await page.getByLabel("Height (cm)").fill("168");
    await page.getByLabel("Weight (kg)").fill("68");
    const firstHelp = page.getByRole("button", { name: /^About / }).first();
    await firstHelp.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Age: 30 years", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Daily step target (optional)").fill("8000");
    await checkHelp(page, "Daily step target");
    await expect(page.getByLabel("Daily step target (optional)")).toHaveValue("8000");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByText("Maintain weight", { exact: true }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("checkbox", { name: /^I understand these targets/ }).check();
    await checkHelp(page, "Macro targets (estimates)");
    await page.getByRole("button", { name: "Create my plan" }).click();
    await expect(page).toHaveURL(/:\d+\/$/);
    let mutations = 0;
    page.on("request", (request) => {
      const rpc = request.url().split("/rest/v1/rpc/")[1];
      if (request.method() === "POST" && rpc && !/^(get_|list_|preview_|search_)/.test(rpc)) mutations++;
    });
    await page.goto("/settings#daily-step-target");
    await page.getByRole("region", { name: "Daily step target", exact: true }).getByLabel("Daily step target", { exact: true }).fill("9000");
    await checkHelp(page, "Daily step target");
    await expect(page.getByRole("region", { name: "Daily step target", exact: true }).getByLabel("Daily step target", { exact: true })).toHaveValue("9000");
    await checkHelp(page, "BMR");
    await checkHelp(page, "BMI");
    await checkHelp(page, "TDEE");
    expect(mutations).toBe(0);
    await page.goto("/activity");
    await page.getByLabel("Steps", { exact: true }).fill("6500");
    await checkHelp(page, "Walking minutes");
    await expect(page.getByLabel("Steps", { exact: true })).toHaveValue("6500");
    await checkHelp(page, "Walking energy");
    expect(mutations).toBe(0);
    await page.goto("/nutrition");
    await checkHelp(page, "Daily nutrition");
    await checkHelp(page, "Planned meals");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.getByLabel("Recipe name", { exact: true }).fill("Draft recipe");
    await checkHelp(page, "Recipe authoring", "About create recipe");
    await expect(page.getByLabel("Recipe name", { exact: true })).toHaveValue("Draft recipe");
    expect(mutations).toBe(0);
    await page.goto("/grocery");
    await checkHelp(page, "Grocery list");
    await page.goto("/progress");
    await checkHelp(page, "Weight");
    await checkHelp(page, "Calendar");
    await page.goto("/workouts/custom");
    await checkHelp(page, "Your own routines");
    await page.getByRole("button", { name: "Create a routine" }).click();
    await page.getByLabel("Routine name").fill("Draft routine");
    await checkHelp(page, "Create routine");
    await expect(page.getByLabel("Routine name")).toHaveValue("Draft routine");
    await page.goto("/workouts");
    await checkHelp(page, "Workout program");
    await checkHelp(page, "This week's plan");
    await page.getByRole("link", { name: "Start", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "About RPE", exact: true })).toBeVisible();
    await expect(page.getByText("Warm-up:", { exact: true })).toBeVisible();
    await expect(page.getByText("Safety", { exact: true })).toBeVisible();
    const beforeHelp = mutations;
    await checkHelp(page, "RPE");
    expect(mutations).toBe(beforeHelp);
  } finally {
    await context.close();
    await deleteLocalAccount(account);
  }
});
