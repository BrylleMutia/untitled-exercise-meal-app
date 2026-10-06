import { test, expect, type Page } from "@playwright/test";
import { createAuthenticatedContext, createLocalAccount, deleteLocalAccount } from "./local-account";

test.setTimeout(180_000);

async function checkHelp(page: Page, title: string) {
  await page.getByRole("button", { name: `About ${title}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await dialog.getByRole("button", { name: `Close ${title} help`, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function checkSummaryAlignment(page: Page, width: number) {
  for (const heading of ["Your progress", "Today's steps"]) {
    const card = page.getByRole("heading", { name: heading, exact: true }).locator("xpath=ancestor::div[contains(@class, 'rounded-3xl')][1]");
    const primary = card.locator(heading === "Your progress" ? "p.text-3xl" : "p.text-2xl");
    const summary = primary.locator("..");
    expect(await summary.evaluate((element) => getComputedStyle(element).textAlign)).toBe(width < 768 ? "center" : "left");
    const text = await primary.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element.querySelector('[aria-hidden="true"]') ?? element);
      const textBounds = range.getBoundingClientRect();
      const parentBounds = element.getBoundingClientRect();
      return { center: textBounds.x + textBounds.width / 2, parentCenter: parentBounds.x + parentBounds.width / 2, left: textBounds.x, parentLeft: parentBounds.x };
    });
    if (width < 768) expect(text.center).toBeCloseTo(text.parentCenter, 0);
    else expect(text.left).toBeCloseTo(text.parentLeft, 0);
    if (heading === "Your progress") {
      const pill = summary.locator("p.inline-flex");
      if (await pill.count()) {
        const pillBounds = (await pill.boundingBox())!;
        const summaryBounds = (await summary.boundingBox())!;
        if (width < 768) expect(pillBounds.x + pillBounds.width / 2).toBeCloseTo(summaryBounds.x + summaryBounds.width / 2, 0);
        else expect(pillBounds.x).toBeCloseTo(summaryBounds.x, 0);
      }
    } else {
      for (const row of await summary.locator(":scope > div").all()) {
        expect(await row.evaluate((element) => getComputedStyle(element).justifyContent)).toBe(width < 768 ? "center" : "flex-start");
      }
    }
  }
}

async function checkWorkoutPlacement(page: Page, width: number) {
  const gap = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const meals = page.getByRole("heading", { name: "Today's meals", exact: true }).locator("xpath=ancestor::div[contains(@class, 'rounded-3xl')][1]");
  const workout = page.getByRole("region", { name: "Today's workout", exact: true });
  await expect(workout).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Today's workout", exact: true })).toHaveCount(1);
  await expect(workout.getByRole("link")).toHaveCount(1);
  const mealsBounds = (await meals.boundingBox())!;
  const workoutBounds = (await workout.boundingBox())!;
  const progress = page.getByRole("heading", { name: "Your progress", exact: true }).locator("xpath=ancestor::div[contains(@class, 'rounded-3xl')][1]");
  const progressBounds = (await progress.boundingBox())!;
  const stepsBounds = (await page.getByRole("region", { name: "Today's steps", exact: true }).boundingBox())!;
  const shortcuts = page.getByRole("heading", { name: "Workouts", exact: true }).locator("xpath=ancestor::a[1]/parent::div");
  const shortcutBounds = (await shortcuts.boundingBox())!;
  if (width >= 1024) {
    expect(workoutBounds.x).toBeCloseTo(mealsBounds.x, 0);
    expect(workoutBounds.width).toBeCloseTo(mealsBounds.width, 0);
    expect(workoutBounds.y - mealsBounds.y - mealsBounds.height).toBeCloseTo(gap, 0);
    expect(progressBounds.y).toBeCloseTo(mealsBounds.y, 0);
    expect(shortcutBounds.y - Math.max(workoutBounds.y + workoutBounds.height, stepsBounds.y + stepsBounds.height)).toBeCloseTo(gap, 0);
    expect(await workout.getAttribute("aria-labelledby")).toBe("home-workout-heading-desktop");
    expect(await meals.locator("..").evaluate((element) => getComputedStyle(element).marginTop)).toBe("35px");
  } else {
    expect(progressBounds.y).toBeGreaterThan(mealsBounds.y + mealsBounds.height);
    expect(stepsBounds.y).toBeGreaterThan(progressBounds.y + progressBounds.height);
    expect(workoutBounds.y - stepsBounds.y - stepsBounds.height).toBeCloseTo(gap, 0);
    expect(shortcutBounds.y - workoutBounds.y - workoutBounds.height).toBeCloseTo(gap, 0);
    expect(await workout.getAttribute("aria-labelledby")).toBe("home-workout-heading-mobile");
  }
  const mealContentBounds = (await meals.locator(":scope > div").boundingBox())!;
  const mealPadding = await meals.evaluate((element) => {
    const style = getComputedStyle(element);
    return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  });
  expect(mealsBounds.height - mealContentBounds.height).toBeCloseTo(mealPadding, 0);
  expect(await page.locator('[id^="home-workout-heading-"]').evaluateAll((elements) => new Set(elements.map((element) => element.id)).size)).toBe(2);
  const action = workout.getByRole("link");
  const actionBounds = (await action.boundingBox())!;
  expect(actionBounds.height).toBeGreaterThanOrEqual(44);
  const summaryBounds = (await workout.locator(":scope > div > div").boundingBox())!;
  const workoutPadding = await workout.evaluate((element) => {
    const style = getComputedStyle(element);
    return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  });
  if (workoutBounds.width - workoutPadding >= 420) {
    expect(actionBounds.x).toBeGreaterThan(summaryBounds.x + summaryBounds.width);
  } else {
    expect(actionBounds.y).toBeGreaterThan(summaryBounds.y + summaryBounds.height);
    expect(actionBounds.width).toBeCloseTo(workoutBounds.width - workoutPadding, 0);
  }
  await page.getByRole("link", { name: "Add food", exact: true }).focus();
  await page.keyboard.press("Tab");
  if (width >= 1024) {
    await expect(action).toBeFocused();
    await page.keyboard.press("Tab");
  }
  await expect(page.getByRole("button", { name: "About Your progress", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Add food", exact: true }).focus();
}

test("help supports previews, pinning, dismissal, focus and one open panel", async ({ page }, testInfo) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "About Today's meals", exact: true });
  const dialog = page.getByRole("dialog", { name: "Today's meals", exact: true });
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
  await dialog.getByRole("button", { name: "Close Today's meals help", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(dialog).toHaveCount(0);

  await trigger.click();
  const second = page.getByRole("button", { name: "About Your progress", exact: true });
  await second.click();
  await expect(dialog).toHaveCount(0);
  const progressHelp = page.getByRole("dialog", { name: "Your progress", exact: true });
  await expect(progressHelp).toBeVisible();
  const source = progressHelp.getByRole("link", { name: "Workout energy source" });
  await expect(source).toHaveAttribute("href", "https://pacompendium.com/conditioning-exercise/");
  await page.keyboard.press("Tab");
  await expect(progressHelp.getByRole("button", { name: "Close Your progress help" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(source).toBeFocused();
  await second.click();
  await expect(progressHelp).toHaveCount(0);

  await trigger.click();
  await page.getByRole("link", { name: "Add food", exact: true }).click();
  await expect(page).toHaveURL(/\/nutrition$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("help fits desktop, mobile and enlarged text without hiding essential states", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const viewports = testInfo.project.use.isMobile
    ? [{ width: 390, height: 844 }, { width: 371, height: 930 }, { width: 320, height: 844 }]
    : [{ width: 547, height: 930 }, { width: 676, height: 930 }, { width: 693, height: 930 }, { width: 767, height: 930 }, { width: 768, height: 930 }, { width: 842, height: 930 }, { width: 875, height: 930 }, { width: 877, height: 930 }, { width: 959, height: 930 }, { width: 971, height: 930 }, { width: 1023, height: 930 }, { width: 1024, height: 930 }, { width: 1027, height: 930 }, { width: 1065, height: 930 }, { width: 1103, height: 930 }, { width: 1168, height: 930 }, { width: 1440, height: 900 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByText("Not logged", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Log daily steps", exact: true })).toBeVisible();
    await expect(page.getByText("Targets are estimates from your profile.")).toHaveCount(0);
    await expect(page.getByText("Keep active, keep healthy")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Quick actions", exact: true })).toHaveCount(0);
    const stepsCard = page.getByRole("region", { name: "Today's steps", exact: true });
    await expect(stepsCard.locator('a[href="/activity"]')).toHaveCount(1);
    await expect(stepsCard.getByRole("link", { name: /^(Log|Edit) steps$/ })).toHaveCount(0);
    expect(await stepsCard.locator("p.text-2xl").locator("..").locator(":scope > div").first().evaluate((element) => getComputedStyle(element).marginTop)).toBe("16px");
    await expect(stepsCard.getByText("Energy not logged", { exact: true })).toBeVisible();
    await expect(stepsCard.locator("time")).toHaveCount(0);
    const energyStatus = page.getByText("Energy estimate: not logged.", { exact: true }).locator("..");
    expect(await energyStatus.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
    expect(await energyStatus.evaluate((element) => getComputedStyle(element).marginTop)).toBe("17px");
    await expect(energyStatus.locator("svg.lucide-flame[aria-hidden=true]")).toHaveCount(1);
    expect(await energyStatus.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const mealsCard = page.getByRole("heading", { name: "Today's meals", exact: true }).locator("xpath=ancestor::div[contains(@class, 'rounded-3xl')][1]");
    expect(await mealsCard.evaluate((element) => getComputedStyle(element).marginTop)).toBe(viewport.width >= 1024 ? "0px" : "35px");
    await checkWorkoutPlacement(page, viewport.width);
    await checkSummaryAlignment(page, viewport.width);
    for (const [name, desktopPadding, tabletPadding, phonePadding] of [
      ["Today's meals", [50, 23, 50, 23], [26, 23, 26, 23], [20, 20, 20, 20]],
      ["Today's workout", [43, 16, 43, 16], [16, 16, 16, 16], [16, 16, 16, 16]],
      ["Your progress", [26, 23, 26, 23], [26, 23, 26, 23], [16, 16, 16, 16]],
      ["Today's steps", [26, 23, 26, 23], [26, 23, 26, 23], [16, 16, 16, 16]],
    ] as const) {
      const card = page.getByRole("heading", { name, exact: true }).locator("xpath=ancestor::div[contains(@class, 'rounded-3xl')][1]");
      const padding = await card.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(parseFloat);
      });
      expect(padding).toEqual(viewport.width >= 1024 ? desktopPadding : viewport.width >= 768 ? tabletPadding : phonePadding);
    }
    await expect(page.locator("header time")).toHaveCount(0);
    const homeDate = mealsCard.locator("time");
    await expect(homeDate).toBeVisible();
    await expect(homeDate).toHaveText(/^\w+, \w+ \d+$/);
    const dateLayout = await homeDate.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const help = element.previousElementSibling!;
      const helpBounds = help.getBoundingClientRect();
      return { left: bounds.left, top: bounds.top, helpRight: helpBounds.right, helpTop: helpBounds.top, previousLabel: help.getAttribute("aria-label"), marginLeft: parseFloat(getComputedStyle(element).marginLeft), background: getComputedStyle(element).backgroundColor, overflow: element.scrollWidth > element.clientWidth };
    });
    expect(dateLayout.previousLabel).toBe("About Today's meals");
    expect(dateLayout.marginLeft).toBeGreaterThanOrEqual(12);
    if (viewport.width === 875) expect(dateLayout.left - dateLayout.helpRight).toBeGreaterThanOrEqual(12);
    expect(dateLayout.background).toBe("rgb(255, 255, 255)");
    expect(dateLayout.overflow).toBe(false);
    const nameBounds = await page.locator("header h1").boundingBox();
    const notificationBounds = await page.getByRole("link", { name: "Notifications", exact: true }).boundingBox();
    expect(notificationBounds!.y).toBeLessThan(nameBounds!.y + nameBounds!.height);
    expect(notificationBounds!.y + notificationBounds!.height).toBeGreaterThan(nameBounds!.y);
    const mealsCircle = await mealsCard.getByRole("img").locator("svg").boundingBox();
    const macros = mealsCard.getByRole("group", { name: "Today's nutrition targets" });
    const macroColumns = macros.locator(":scope > div");
    await expect(macroColumns).toHaveCount(3);
    const macroBounds = await macros.boundingBox();
    let previousColumnX = -1;
    let previousBarY: number | undefined;
    for (const column of await macroColumns.all()) {
      const header = column.locator(":scope > div").first();
      const label = await header.locator(":scope > span").first().boundingBox();
      const value = await header.locator(":scope > span").last().boundingBox();
      const bar = await column.getByRole("progressbar").boundingBox();
      expect(value!.y).toBeGreaterThan(label!.y + label!.height);
      expect(value!.x).toBeCloseTo(label!.x, 0);
      expect(label!.x).toBeGreaterThan(previousColumnX);
      if (previousBarY !== undefined) expect(bar!.y).toBeCloseTo(previousBarY, 0);
      previousColumnX = label!.x;
      previousBarY = bar!.y;
      await expect(header.locator(":scope > span").last()).toContainText(/of \d+ g/);
    }
    if (viewport.width < 768) {
      const ringDisplay = await mealsCard.getByRole("img").boundingBox();
      expect(macroBounds!.y).toBeGreaterThan(ringDisplay!.y + ringDisplay!.height);
    } else {
      expect(macroBounds!.x + macroBounds!.width).toBeLessThan(mealsCircle!.x);
    }
    for (const heading of ["Today's meals", "Your progress", "Today's steps"]) {
      const card = page.getByRole("heading", { name: heading, exact: true }).locator("xpath=ancestor::div[contains(@class, 'rounded-3xl')][1]");
      const ring = await card.getByRole("img").locator("svg").boundingBox();
      expect(ring!.width).toBeCloseTo(mealsCircle!.width, 2);
      expect(ring!.height).toBeCloseTo(mealsCircle!.height, 2);
      const action = card.getByRole("link", { name: heading === "Today's meals" ? "Add food" : heading === "Your progress" ? "Open workouts" : "Log daily steps", exact: true });
      const actionBox = await action.boundingBox();
      expect(Math.round(actionBox!.width)).toBeGreaterThanOrEqual(44);
      expect(Math.round(actionBox!.height)).toBeGreaterThanOrEqual(44);
      expect(actionBox!.x).toBeGreaterThan(ring!.x + ring!.width / 2);
      expect(actionBox!.x).toBeLessThan(ring!.x + ring!.width);
      expect(actionBox!.y).toBeLessThan(ring!.y);
      expect(actionBox!.y + actionBox!.height).toBeGreaterThan(ring!.y);
      if (viewport.width < 768) {
        const cardBounds = await card.boundingBox();
        expect(ring!.x + ring!.width / 2).toBeCloseTo(cardBounds!.x + cardBounds!.width / 2, 0);
        const headingBounds = await card.getByRole("heading", { name: heading, exact: true }).boundingBox();
        expect(ring!.y).toBeGreaterThan(headingBounds!.y + headingBounds!.height);
        if (heading !== "Today's meals") {
          const summary = card.locator(heading === "Your progress" ? "p.text-3xl" : "p.text-2xl");
          const summaryBounds = await summary.boundingBox();
          expect(summaryBounds!.y).toBeGreaterThan(ring!.y + ring!.height);
        }
      }
      if (viewport.width >= 875) {
        const centerOffset = await card.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const circle = element.querySelector('[role="img"]')!.getBoundingClientRect();
          return Math.abs(circle.y + circle.height / 2 - bounds.y - bounds.height / 2);
        });
        expect(centerOffset).toBeLessThanOrEqual(1);
      }
    }
    const trigger = page.getByRole("button", { name: "About Today's steps", exact: true });
    const box = await trigger.boundingBox();
    expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Today's steps", exact: true });
    await expect(dialog).toBeVisible();
    const panel = await dialog.boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(15);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width - 15);
    expect(panel!.y).toBeGreaterThanOrEqual(15);
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height - 15);
    await page.screenshot({ path: `test-results/contextual-help-open-${testInfo.project.name}-${viewport.width}.png` });
    await dialog.getByRole("button", { name: "Close Today's steps help" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/contextual-help-${testInfo.project.name}-${viewport.width}.png`, fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const enlargedTextStyles = await page.addStyleTag({ content: "html { font-size: 24px !important; }" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("24px");
  await checkWorkoutPlacement(page, viewports.at(-1)!.width);
  await checkSummaryAlignment(page, viewports.at(-1)!.width);
  expect(await page.getByText("Energy estimate: not logged.", { exact: true }).locator("..").evaluate((element) => getComputedStyle(element).marginTop)).toBe("17px");
  expect(await page.getByRole("region", { name: "Today's steps", exact: true }).locator("p.text-2xl").locator("..").locator(":scope > div").first().evaluate((element) => getComputedStyle(element).marginTop)).toBe("16px");
  const enlargedDate = page.locator("main time").first();
  const dateHeight = await enlargedDate.evaluate((element) => {
    const styles = getComputedStyle(element);
    return { actual: element.getBoundingClientRect().height, maximum: parseFloat(styles.lineHeight) * 3 + parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom) };
  });
  expect(dateHeight.actual).toBeLessThanOrEqual(dateHeight.maximum);
  const enlargedMeals = page.getByRole("heading", { name: "Today's meals", exact: true }).locator("xpath=ancestor::div[contains(@class, 'rounded-3xl')][1]");
  expect(await enlargedMeals.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const enlargedMacros = enlargedMeals.getByRole("group", { name: "Today's nutrition targets" });
  const macroLayout = await enlargedMacros.evaluate((element) => {
    const columns = getComputedStyle(element).gridTemplateColumns.split(" ").length;
    const bounds = element.getBoundingClientRect();
    return { columns, width: bounds.width, threshold: parseFloat(getComputedStyle(document.documentElement).fontSize) * 15 };
  });
  expect(macroLayout.columns).toBe(macroLayout.width < macroLayout.threshold ? 1 : 3);
  await page.screenshot({ path: `test-results/meals-enlarged-${testInfo.project.name}.png`, fullPage: true });
  await checkHelp(page, "Today's steps");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await enlargedTextStyles.evaluate((element) => element.parentNode?.removeChild(element));
  await page.getByRole("link", { name: "Add food", exact: true }).click();
  await expect(page).toHaveURL(/\/nutrition$/);
  await expect(page.locator("header time")).toHaveCount(0);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("link", { name: "Open workouts", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/workouts$/);
  await expect(page.getByRole("heading", { name: "This week's plan", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("link", { name: "Log daily steps", exact: true }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByLabel("Steps", { exact: true })).toBeVisible();
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
  // The initial snapshot is server-rendered. Intercept a preference action to
  // trigger the client read path without forwarding any write to the database.
  await page.route("**/rest/v1/rpc/update_units", (route) => route.fulfill({ status: 200, json: {} }));
  await page.goto("/settings");
  await page.getByRole("button", { name: "imperial", exact: true }).click();
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
    await page.getByLabel("Age", { exact: true }).fill("30");
    await page.getByText("None of the situations below apply to me", { exact: true }).click();
    await page.getByLabel("Height (cm)").fill("168");
    await page.getByLabel("Weight (kg)").fill("68");
    const firstHelp = page.getByRole("button", { name: /^About / }).first();
    await firstHelp.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Age", { exact: true })).toHaveValue("30");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByLabel("Daily step target (optional)").fill("8000");
    await checkHelp(page, "Daily step target");
    await expect(page.getByLabel("Daily step target (optional)")).toHaveValue("8000");
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByText("Maintain weight", { exact: true }).click();
    await page.getByRole("button", { name: /Continue/ }).click();
    await checkHelp(page, "Macro targets (estimates)");
    await page.getByRole("button", { name: "Create my plan" }).click();
    await expect(page).toHaveURL(/:\d+\/$/);
    let mutations = 0;
    page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/rest/v1/rpc/")) mutations++; });
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
    await checkHelp(page, "Create recipe");
    await expect(page.getByLabel("Recipe name", { exact: true })).toHaveValue("Draft recipe");
    expect(mutations).toBe(0);
    await page.goto("/grocery");
    await checkHelp(page, "This week's list");
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
