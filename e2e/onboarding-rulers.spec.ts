import { selectBirthday } from "./birth-date";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createAuthenticatedContext, createLocalAccount, deleteLocalAccount } from "./local-account";

const acknowledgement = (page: Page) => page.getByRole("checkbox", { name: /^I understand these targets/ });

test("onboarding Gender radios support keyboard selection, recovery, Review editing and saved restoration", async ({ browser }, info) => {
  const account = await createLocalAccount(`gender-radios-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 428, height: 944 });
    await page.goto("/onboarding");
    const group = page.getByRole("radiogroup", { name: "Gender", exact: true });
    const female = group.getByRole("radio", { name: "Female", exact: true });
    const male = group.getByRole("radio", { name: "Male", exact: true });
    await expect(female).toBeChecked();
    await expect(male).not.toBeChecked();
    await fillAboutYou(page);
    await female.focus();
    await expect(female).toBeFocused();
    await female.press("ArrowRight");
    await expect(male).toBeChecked();
    await expect(male).toBeFocused();
    await expect(female).not.toBeChecked();
    await page.reload();
    await expect(page.getByText("Onboarding draft restored from this device.")).toBeVisible();
    await expect(male).toBeChecked();
    await goToReview(page);
    await page.getByRole("button", { name: "Edit about you", exact: true }).click();
    await expect(male).toBeChecked();
    await male.press("ArrowLeft");
    await expect(female).toBeChecked();
    await male.check();
    const textSize = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.setViewportSize({ width: 320, height: 480 });
    await male.focus();
    for (const radio of [female, male]) {
      const target = (await radio.locator("..").boundingBox())!;
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/gender-radios-large-${info.project.name}.png` });
    await textSize.evaluate(element => element.parentNode?.removeChild(element));
    await page.setViewportSize({ width: 428, height: 944 });
    await goToReview(page);
    await page.getByRole("button", { name: "These situations apply to me / I’m unsure", exact: true }).click();
    await page.getByRole("button", { name: "Continue without automated targets", exact: true }).click();
    await expect(page).toHaveURL(/:\d+\/$/, { timeout: 45_000 });
    await page.reload();
    await page.goto("/settings");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(male).toBeChecked();
    await expect(female).not.toBeChecked();
    await page.screenshot({ path: `test-results/compact-birthday-gender-${info.project.name}.png` });
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("onboarding supports legacy age-only profiles and refreshes birthday age at midnight and resume without mutations", async ({ browser }, info) => {
  const account = await createLocalAccount(`birthday-legacy-${info.project.name}`);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  await client.auth.signInWithPassword(account);
  const saved = await client.rpc("complete_onboarding", { p_payload: { calendarRevision: 1, profile: {
    name: "Legacy birthday", age: 30, sex: "female", heightCm: 168, weightKg: 68, units: "metric", experience: "beginner",
    equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, weekStartsOn: 0, goal: "maintain", targetEligibility: "unsupported",
  }, idempotencyKey: crypto.randomUUID() } });
  expect(saved.error).toBeNull();
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  try {
    const page = await context.newPage();
    await page.goto("/settings");
    await expect(page.getByText("30 years · Birthday not set", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Birthday not set · Saved age: 30 years", { exact: true })).toBeVisible();
    await selectBirthday(page, 30);
    await goToReview(page);
    await page.getByRole("button", { name: "These situations apply to me / I’m unsure", exact: true }).click();
    await page.getByRole("button", { name: "Continue without automated targets", exact: true }).click();
    await expect(page).toHaveURL(/:\d+\/$/, { timeout: 45_000 });
    await page.goto("/settings");
    const year = await page.evaluate(() => new Date().getFullYear());
    await expect(page.getByText(`30 years · Birthday: ${year - 30}-01-01`, { exact: true })).toBeVisible();
    const midnight = await page.evaluate(year => new Date(year, 11, 31, 23, 59, 45).getTime(), year);
    await page.clock.install({ time: new Date(midnight) });
    let writes = 0;
    page.on("request", request => { if (request.method() === "POST" && /\/rpc\/(update_profile|complete_onboarding|update_units)/.test(request.url())) writes++; });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.clock.runFor(16_000);
    await expect(page.getByText(`31 years · Birthday: ${year - 30}-01-01`, { exact: true })).toBeVisible();
    const later = await page.evaluate(year => new Date(year + 2, 0, 2, 12).getTime(), year);
    await page.clock.setSystemTime(new Date(later));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByText(`32 years · Birthday: ${year - 30}-01-01`, { exact: true })).toBeVisible();
    expect(writes).toBe(0);
    const stored = await client.from("profiles").select("age,birth_date").single();
    expect(stored.data).toEqual({ age: 30, birth_date: `${year - 30}-01-01` });
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("onboarding birthday wheels preserve partial dates, clear invalid days and support keyboard and native scrolling", async ({ browser }, info) => {
  const account = await createLocalAccount(`birthday-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account, { hasTouch: info.project.name === "mobile", isMobile: info.project.name === "mobile" });
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 376, height: 930 });
    await page.goto("/onboarding");
    const day = page.getByRole("listbox", { name: "Day", exact: true });
    const month = page.getByRole("listbox", { name: "Month", exact: true });
    const year = page.getByRole("listbox", { name: "Year", exact: true });
    const expectCenteredDate = async (column: typeof day) => {
      const geometry = await column.evaluate(element => {
        const wheel = element.getBoundingClientRect();
        const selected = element.querySelector('[aria-selected="true"]')!.getBoundingClientRect();
        const band = element.closest(".birth-date-picker")!.querySelector(".birth-date-selection")!.getBoundingClientRect();
        const spacer = element.firstElementChild!.getBoundingClientRect();
        const selectedOption = element.querySelector('[aria-selected="true"]')!;
        const neighbors = [selectedOption.previousElementSibling, selectedOption.nextElementSibling]
          .filter(option => option?.getAttribute("role") === "option")
          .map(option => { const bounds = option!.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom }; });
        return { wheelHeight: wheel.height, wheelTop: wheel.top, wheelBottom: wheel.bottom, neighbors, rowHeight: selected.height, spacerHeight: spacer.height,
          selectedCenter: selected.top + selected.height / 2, wheelCenter: wheel.top + wheel.height / 2,
          bandCenter: band.top + band.height / 2, bandHeight: band.height };
      });
      expect(geometry.wheelHeight).toBeCloseTo(geometry.rowHeight * 3, 0);
      expect(geometry.spacerHeight).toBeCloseTo(geometry.rowHeight, 0);
      for (const neighbor of geometry.neighbors) {
        expect(neighbor.top).toBeGreaterThanOrEqual(geometry.wheelTop - 1);
        expect(neighbor.bottom).toBeLessThanOrEqual(geometry.wheelBottom + 1);
      }
      expect(geometry.selectedCenter).toBeCloseTo(geometry.wheelCenter, 0);
      expect(geometry.bandCenter).toBeCloseTo(geometry.wheelCenter, 0);
      expect(geometry.bandHeight).toBe(geometry.rowHeight);
    };
    await expect(page.getByLabel("Age", { exact: true })).toHaveCount(0);
    for (const column of [day, month, year]) {
      await expect(column.getByRole("option", { selected: true })).toHaveText("—");
      await expectCenteredDate(column);
    }
    await expect(day).toHaveCSS("height", "132px");
    await expect(page.getByRole("group", { name: "Birthday", exact: true }).locator("legend")).toHaveCSS("margin-bottom", "12px");
    await day.press("End");
    await expect(day.getByRole("option", { selected: true })).toHaveText("31");
    await expectCenteredDate(day);
    await day.press("Home");
    await day.press("ArrowUp");
    await expect(day.getByRole("option", { selected: true })).toHaveText("—");
    await expectCenteredDate(day);
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Please check" })).toContainText("Choose a valid day, month, and year");
    await year.press("Home");
    await year.pressSequentially("2000");
    await month.press("Home");
    await month.pressSequentially("Feb");
    await day.press("End");
    await expect(day.getByRole("option", { selected: true })).toHaveText("29");
    await year.press("ArrowUp"); // Descending years: 2001 is not a leap year.
    await expect(year.getByRole("option", { selected: true })).toHaveText("2001");
    await expect(day.getByRole("option", { selected: true })).toHaveText("—");
    await expect(page.getByRole("status").filter({ hasText: "Choose a valid day" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Onboarding draft restored from this device.")).toBeVisible();
    await expect(year.getByRole("option", { selected: true })).toHaveText("2001");
    await expect(month.getByRole("option", { selected: true })).toHaveText("Feb");
    await expect(day.getByRole("option", { selected: true })).toHaveText("—");
    await day.press("Home");
    const nextOption = (await day.getByRole("option", { name: "2", exact: true }).boundingBox())!;
    const dayPort = (await day.boundingBox())!;
    await page.mouse.click(nextOption.x + nextOption.width / 2, Math.min(dayPort.y + dayPort.height, nextOption.y + nextOption.height) - 8);
    await expect(day.getByRole("option", { selected: true })).toHaveText("2");
    await day.hover();
    await page.mouse.wheel(0, 88);
    await expect(day.getByRole("option", { selected: true })).toHaveText("4");
    if (info.project.name === "mobile") {
      const session = await context.newCDPSession(page);
      const box = (await day.boundingBox())!;
      const x = box.x + box.width / 2, y = box.y + box.height * 0.8;
      await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let step = 1; step <= 6; step++) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 9 }] });
        await page.waitForTimeout(50);
      }
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(day.getByRole("option", { selected: true })).not.toHaveText("4");
      await session.detach();
      await day.press("Home");
      await day.pressSequentially("4");
    }
    await day.press("PageDown");
    await expect(day.getByRole("option", { selected: true })).toHaveText("14");
    await fillAboutYou(page);
    for (const width of [320, 376, 390, 428, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      await month.focus();
      await page.screenshot({ path: `test-results/birthday-${info.project.name}-${width}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await day.getByRole("option", { selected: true }).evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await expectCenteredDate(month);
      await expectAnchoredFrame(page);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.setViewportSize({ width: 320, height: 480 });
    await day.focus();
    await day.press("ArrowDown");
    await expectCenteredDate(day);
    const selectedBounds = (await day.getByRole("option", { selected: true }).boundingBox())!;
    const cardBounds = (await page.locator("[data-onboarding-scroll]").boundingBox())!;
    expect(selectedBounds.y).toBeGreaterThanOrEqual(cardBounds.y);
    expect(selectedBounds.y + selectedBounds.height).toBeLessThanOrEqual(cardBounds.y + cardBounds.height + 1);
    for (const column of [day, month, year]) {
      const selected = column.getByRole("option", { selected: true });
      const geometry = await selected.evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const text = range.getBoundingClientRect(), box = element.getBoundingClientRect();
        return { textLeft: text.left, textRight: text.right, left: box.left, right: box.right, width: box.width };
      });
      expect(geometry.width).toBeGreaterThanOrEqual(44);
      expect(geometry.textLeft).toBeGreaterThanOrEqual(geometry.left);
      expect(geometry.textRight).toBeLessThanOrEqual(geometry.right);
    }
    await page.screenshot({ path: `test-results/birthday-large-text-${info.project.name}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expectAnchoredFrame(page);
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("onboarding birthday persists through save failure, restart and Settings edit", async ({ browser }, info) => {
  const account = await createLocalAccount(`birthday-save-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  try {
    const page = await context.newPage();
    await page.goto("/onboarding");
    await fillAboutYou(page);
    await goToReview(page);
    const currentYear = await page.evaluate(() => new Date().getFullYear());
    await expect(page.getByText(new RegExp(`Birthday: ${currentYear - 30}-01-01`))).toBeVisible();
    await acknowledgement(page).check();
    let sentBirthday = "";
    await page.route("**/rest/v1/rpc/complete_onboarding", route => {
      sentBirthday = route.request().postDataJSON().p_payload.profile.birthDate;
      return route.fulfill({ status: 503, json: { message: "Temporary birthday save failure" } });
    });
    await page.getByRole("button", { name: "Create my plan", exact: true }).click();
    await expect.poll(() => sentBirthday).toBe(`${currentYear - 30}-01-01`);
    await expect(page.getByRole("alert").filter({ hasText: "Temporary birthday save failure" })).toBeVisible();
    await expect(acknowledgement(page)).toBeChecked();
    await page.unroute("**/rest/v1/rpc/complete_onboarding");
    await page.getByRole("button", { name: /^(Create my plan|Retry saving)$/ }).click();
    await expect(page).toHaveURL(/:\d+\/$/, { timeout: 45_000 });
    await page.reload();
    await page.goto("/settings");
    await expect(page.getByText(`30 years · Birthday: ${currentYear - 30}-01-01`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Age: 30 years", { exact: true })).toBeVisible();
    await page.getByRole("listbox", { name: "Year", exact: true }).press("ArrowDown");
    await expect(page.getByText("Age: 31 years", { exact: true })).toBeVisible();
    await goToReview(page);
    await acknowledgement(page).check();
    await page.getByRole("button", { name: "Create my plan", exact: true }).click();
    await expect(page).toHaveURL(/:\d+\/$/, { timeout: 45_000 });
    await page.goto("/settings");
    await expect(page.getByText(`31 years · Birthday: ${currentYear - 31}-01-01`, { exact: true })).toBeVisible();
  } finally { await context.close(); await deleteLocalAccount(account); }
});

async function fillAboutYou(page: Page) {
  await page.getByLabel("What should we call you?").fill("Ruler Test");
  await selectBirthday(page, 30);
  await page.getByLabel("Height (cm)", { exact: true }).fill("180");
  await page.getByLabel("Weight (kg)", { exact: true }).fill("66.2");
}

async function goToReview(page: Page) {
  for (let step = 0; step < 4; step++) await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
}

test("onboarding rulers support exact input, bounded gestures, keyboard and responsive layouts", async ({ browser }, info) => {
  const account = await createLocalAccount(`rulers-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  try {
    const page = await context.newPage();
    await page.setViewportSize(info.project.use.viewport!);
    await page.goto("/onboarding");
    const height = page.getByLabel("Height (cm)", { exact: true });
    const weight = page.getByLabel("Weight (kg)", { exact: true });
    const ruler = page.getByRole("slider", { name: "Weight ruler (kg)" });
    await expect(height).toHaveValue("");
    await expect(weight).toHaveValue("");
    await expect(ruler).toHaveAttribute("aria-valuetext", "Not entered");
    await expect(page.getByText("Can we estimate a food target for you?", { exact: true })).toHaveCount(0);
    await ruler.focus();
    await page.keyboard.press("ArrowRight");
    await expect(weight).toHaveValue("70.1");
    await ruler.press("Home");
    await expect(weight).toHaveValue("35");
    await ruler.press("End");
    await expect(weight).toHaveValue("300");
    await ruler.press("ArrowRight");
    await expect(weight).toHaveValue("300");
    await weight.fill("66.2");
    await ruler.press("PageUp");
    await expect(weight).toHaveValue("67.2");
    await ruler.press("ArrowDown");
    await expect(weight).toHaveValue("67.1");
    const box = await ruler.boundingBox();
    if (!box) throw new Error("Weight ruler has no hit area");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(weight).toHaveValue("68.1");
    await ruler.dispatchEvent("pointerdown", { pointerId: 21, pointerType: "touch", isPrimary: true, button: 0, clientX: 100, clientY: 20 });
    await ruler.dispatchEvent("pointermove", { pointerId: 21, pointerType: "touch", isPrimary: true, clientX: 102, clientY: 70 });
    await ruler.dispatchEvent("pointercancel", { pointerId: 21, pointerType: "touch" });
    await expect(weight).toHaveValue("68.1");
    await expect(ruler).toHaveCSS("touch-action", "pan-y pinch-zoom");
    await weight.fill(".");
    await expect(weight).toHaveValue(".");
    await expect(weight).toHaveAttribute("aria-invalid", "true");
    await weight.fill("301");
    await expect(weight).toHaveValue("301");
    await expect(page.getByText("Weight must be between 35 and 300 kg (77–661 lb).", { exact: true })).toBeVisible();
    await weight.fill("");
    await expect(weight).toHaveValue("");
    await fillAboutYou(page);
    await height.fill("230");
    await weight.fill("35");
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Imperial (lb, in)" }).click();
      await expect(page.getByLabel("Height (in)", { exact: true })).toHaveAttribute("aria-invalid", "false");
      await expect(page.getByLabel("Weight (lb)", { exact: true })).toHaveAttribute("aria-invalid", "false");
      await page.getByRole("button", { name: "Metric (kg, cm)" }).click();
      await expect(height).toHaveValue("230");
      await expect(weight).toHaveValue("35");
    }
    await fillAboutYou(page);
    await page.getByRole("slider", { name: "Height ruler (cm)" }).focus();
    for (const width of [320, 376, 390, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      await page.screenshot({ path: `test-results/onboarding-rulers-${info.project.name}-${width}.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const input of [height, weight]) expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.setViewportSize({ width: 320, height: 930 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/onboarding-rulers-large-text-${info.project.name}.png`, fullPage: true });
  } finally { await context.close(); await deleteLocalAccount(account); }
});

async function expectAnchoredFrame(page: Page) {
  const viewportHeight = await page.evaluate(() => innerHeight);
  await expect.poll(async () => (await page.locator("[data-onboarding-frame]").boundingBox())!.height).toBeCloseTo(viewportHeight, 0);
  const geometry = await page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector(selector)!.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, height: bounds.height };
    };
    return {
      header: rect("[data-onboarding-header]"), card: rect("[data-onboarding-card]"), footer: rect("[data-onboarding-footer]"),
      contentHeight: document.querySelector("[data-onboarding-scroll]")!.firstElementChild!.getBoundingClientRect().height,
      documentWidth: document.documentElement.scrollWidth, width: innerWidth, height: innerHeight, documentScroll: scrollY,
      gap: Number.parseFloat(getComputedStyle(document.querySelector("[data-onboarding-frame]")!).rowGap),
    };
  });
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.width);
  expect(geometry.documentScroll).toBe(0);
  expect(geometry.card.top).toBeCloseTo(geometry.header.bottom + geometry.gap, 0);
  const available = geometry.footer.top - geometry.gap - geometry.card.top;
  expect(geometry.card.bottom).toBeLessThanOrEqual(geometry.footer.top - geometry.gap + 1);
  expect(Math.abs(geometry.card.height - Math.min(available, geometry.contentHeight))).toBeLessThanOrEqual(1);
  expect(geometry.card.height).toBeGreaterThan(0);
  expect(geometry.footer.bottom).toBeLessThanOrEqual(geometry.height);
  const before = await page.locator("[data-onboarding-footer]").boundingBox();
  await page.locator("[data-onboarding-scroll]").evaluate(element => { element.scrollTop = element.scrollHeight; });
  expect((await page.locator("[data-onboarding-footer]").boundingBox())!.y).toBe(before!.y);
  expect((await page.locator("[data-onboarding-header]").boundingBox())!.y).toBe(geometry.header.top);
}

test("onboarding frame sizes cards to content and anchors actions through all five steps", async ({ browser }, info) => {
  const account = await createLocalAccount(`frame-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 376, height: 930 });
    await page.goto("/onboarding");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("region", { name: "Onboarding form" }).getByRole("alert")).toBeFocused();
    await expect(page.getByRole("region", { name: "Onboarding form" }).getByRole("alert")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeInViewport();
    await fillAboutYou(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    const textStyle = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    for (let step = 0; step < 5; step++) {
      for (const width of [320, 376, 390, 1440]) {
        await page.setViewportSize({ width, height: 930 });
        await expectAnchoredFrame(page);
      }
      await page.setViewportSize({ width: 320, height: 930 });
      await page.screenshot({ path: `test-results/onboarding-frame-large-${info.project.name}-${step}.png`, fullPage: true });
      if (step < 4) {
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        await expect.poll(() => page.locator("[data-onboarding-scroll]").evaluate(element => element.scrollTop)).toBe(0);
      }
    }
    await textStyle.evaluate(element => element.parentNode?.removeChild(element));
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const size of [{ width: 376, height: 360 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await expectAnchoredFrame(page);
      await page.screenshot({ path: `test-results/onboarding-frame-short-${info.project.name}-${size.width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 376, height: 930 });
    await acknowledgement(page).check();
    await expect(page.getByRole("button", { name: "Create my plan", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Edit about you", exact: true }).click();
    await expect.poll(() => page.locator("[data-onboarding-scroll]").evaluate(element => element.scrollTop)).toBe(0);
    await expect(page.getByRole("heading", { name: "About you", exact: true })).toBeFocused();
    await page.getByLabel("Weight (kg)", { exact: true }).focus();
    await expect(page.getByLabel("Weight (kg)", { exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/onboarding-frame-${info.project.name}-376.png`, fullPage: true });
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("onboarding compact cards grow and shrink with food warnings, goal fields and Review previews", async ({ browser }, info) => {
  const account = await createLocalAccount(`compact-cards-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 376, height: 930 });
    await page.goto("/onboarding");
    await fillAboutYou(page);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const card = page.locator("[data-onboarding-card]");
    const footer = page.locator("[data-onboarding-footer]");
    const cardHeight = async () => (await card.boundingBox())!.height;
    const footerBottom = async () => { const rect = (await footer.boundingBox())!; return rect.y + rect.height; };
    await expectAnchoredFrame(page);
    const foodHeight = await cardHeight();
    const bottom = await footerBottom();
    const foodBounds = (await card.boundingBox())!;
    expect((await footer.boundingBox())!.y - foodBounds.y - foodBounds.height).toBeGreaterThan(48);
    await page.getByLabel("Eating style").selectOption("Keto-style");
    await expect.poll(cardHeight).toBeGreaterThan(foodHeight);
    expect(await footerBottom()).toBe(bottom);
    await page.getByLabel("Eating style").selectOption("No restrictions");
    await expect.poll(cardHeight).toBeCloseTo(foodHeight, 0);
    await page.screenshot({ path: `test-results/onboarding-compact-food-${info.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Maintain weight", exact: true }).click();
    const goalHeight = await cardHeight();
    await page.getByRole("button", { name: "Lose weight", exact: true }).click();
    await expect(page.getByLabel("Target weight (kg) — optional", { exact: true })).toBeVisible();
    await expect.poll(cardHeight).toBeGreaterThan(goalHeight);
    expect(await footerBottom()).toBe(bottom);
    await page.getByRole("button", { name: "Maintain weight", exact: true }).click();
    await expect.poll(cardHeight).toBeCloseTo(goalHeight, 0);
    await page.screenshot({ path: `test-results/onboarding-compact-goal-${info.project.name}.png`, fullPage: true });
    await page.setViewportSize({ width: 376, height: 360 });
    await expectAnchoredFrame(page);
    const shortCard = (await card.boundingBox())!;
    expect(shortCard.y + shortCard.height).toBeCloseTo((await footer.boundingBox())!.y - 16, 0);
    await page.setViewportSize({ width: 376, height: 930 });
    await expectAnchoredFrame(page);
    expect(await cardHeight()).toBeCloseTo(goalHeight, 0);
    await page.setViewportSize({ width: 1440, height: 930 });
    await expectAnchoredFrame(page);
    await page.screenshot({ path: `test-results/onboarding-compact-goal-desktop-${info.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.setViewportSize({ width: 376, height: 1500 });
    await expectAnchoredFrame(page);
    const reviewHeight = await cardHeight();
    const reviewBottom = await footerBottom();
    await acknowledgement(page).check();
    await expect(page.getByRole("heading", { name: "Your estimated daily food target", exact: true })).toBeVisible();
    await expect.poll(cardHeight).toBeGreaterThan(reviewHeight);
    expect(await footerBottom()).toBe(reviewBottom);
    await acknowledgement(page).uncheck();
    await expect.poll(cardHeight).toBeCloseTo(reviewHeight, 0);
    await expectAnchoredFrame(page);
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("onboarding frame follows keyboard viewport changes, preserves zoom and cleans up on completion", async ({ browser }, info) => {
  const account = await createLocalAccount(`frame-keyboard-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  try {
    await context.addInitScript(() => {
      const viewport = new EventTarget();
      const state = { height: innerHeight, offsetTop: 0, scale: 1 };
      const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
      const add = viewport.addEventListener.bind(viewport);
      const remove = viewport.removeEventListener.bind(viewport);
      viewport.addEventListener = (type, listener, options) => {
        if (listener) { const current = listeners.get(type) ?? new Set(); current.add(listener); listeners.set(type, current); }
        add(type, listener, options);
      };
      viewport.removeEventListener = (type, listener, options) => {
        if (listener) listeners.get(type)?.delete(listener);
        remove(type, listener, options);
      };
      Object.defineProperties(viewport, {
        height: { get: () => state.height }, width: { get: () => innerWidth },
        offsetTop: { get: () => state.offsetTop }, offsetLeft: { value: 0 },
        pageTop: { get: () => state.offsetTop + scrollY }, pageLeft: { value: 0 }, scale: { get: () => state.scale },
      });
      Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
      Object.assign(window, { onboardingViewportTest: {
        set(height: number, offsetTop = 0, scale = 1) {
          Object.assign(state, { height, offsetTop, scale }); viewport.dispatchEvent(new Event("resize")); viewport.dispatchEvent(new Event("scroll"));
        },
        count() { return [...listeners.values()].reduce((sum, entries) => sum + entries.size, 0); },
      } });
    });
    const page = await context.newPage();
    await page.setViewportSize({ width: 376, height: 930 });
    await page.goto("/onboarding");
    await fillAboutYou(page);
    await page.getByLabel("Weight (kg)", { exact: true }).focus();
    const setViewport = async (height: number, offsetTop = 0, scale = 1) => {
      await page.evaluate(({ height, offsetTop, scale }) => {
        (window as unknown as { onboardingViewportTest: { set: (h: number, t: number, s: number) => void } }).onboardingViewportTest.set(height, offsetTop, scale);
      }, { height, offsetTop, scale });
    };
    await setViewport(420, 40);
    await expect.poll(async () => (await page.locator("[data-onboarding-frame]").boundingBox())!.height).toBe(420);
    const frame = (await page.locator("[data-onboarding-frame]").boundingBox())!;
    expect(frame.y).toBe(40);
    const input = (await page.getByLabel("Weight (kg)", { exact: true }).boundingBox())!;
    const port = (await page.locator("[data-onboarding-scroll]").boundingBox())!;
    expect(input.y).toBeGreaterThanOrEqual(port.y);
    expect(input.y + input.height).toBeLessThanOrEqual(port.y + port.height);
    const footer = (await page.locator("[data-onboarding-footer]").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(460);
    await page.screenshot({ path: `test-results/onboarding-frame-keyboard-${info.project.name}.png`, fullPage: true });
    await setViewport(350, 80, 2);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect((await page.locator("[data-onboarding-frame]").boundingBox())!.height).toBe(420);
    expect((await page.locator("[data-onboarding-frame]").boundingBox())!.y).toBe(40);
    await setViewport(930);
    await expect.poll(async () => (await page.locator("[data-onboarding-frame]").boundingBox())!.height).toBe(930);
    await goToReview(page);
    await page.getByRole("button", { name: "These situations apply to me / I’m unsure", exact: true }).click();
    await page.getByRole("button", { name: "Continue without automated targets", exact: true }).click();
    await expect(page).toHaveURL(/:\d+\/$/, { timeout: 45_000 });
    await expect(page.locator("[data-onboarding-frame]")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as unknown as { onboardingViewportTest: { count: () => number } }).onboardingViewportTest.count())).toBe(0);
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("onboarding Review gates estimates, restores acknowledgement and preserves manual logging", async ({ browser }, info) => {
  const account = await createLocalAccount(`review-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  try {
    const page = await context.newPage();
    await page.setViewportSize(info.project.use.viewport!);
    await page.goto("/onboarding");
    await fillAboutYou(page);
    await goToReview(page);
    const estimates = page.getByRole("heading", { name: "Your estimated daily food target", exact: true });
    await expect(acknowledgement(page)).not.toBeChecked();
    await expect(estimates).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create my plan", exact: true })).toBeDisabled();
    await acknowledgement(page).check();
    await expect(estimates).toBeVisible();
    await page.getByRole("button", { name: "Edit about you", exact: true }).click();
    await expect(page.getByLabel("Weight (kg)", { exact: true })).toHaveValue("66.2");
    await goToReview(page);
    await expect(acknowledgement(page)).toBeChecked();
    await page.reload();
    await expect(page.getByText("Onboarding draft restored from this device.")).toBeVisible();
    await goToReview(page);
    await expect(acknowledgement(page)).toBeChecked();
    await acknowledgement(page).uncheck();
    await expect(estimates).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create my plan", exact: true })).toBeDisabled();
    const manual = page.getByRole("button", { name: "These situations apply to me / I’m unsure", exact: true });
    await manual.click();
    await expect(acknowledgement(page)).not.toBeChecked();
    await expect(manual).toHaveAttribute("aria-pressed", "true");
    await expect(estimates).toHaveCount(0);
    await acknowledgement(page).check();
    await expect(manual).toHaveAttribute("aria-pressed", "false");
    await manual.click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.setViewportSize({ width: 320, height: 930 });
    await page.screenshot({ path: `test-results/onboarding-review-large-text-${info.project.name}.png`, fullPage: true });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.getByRole("button", { name: "Continue without automated targets", exact: true }).click();
    await expect(page).toHaveURL(/:\d+\/$/, { timeout: 45_000 });
    await page.reload();
    await expect(page).toHaveURL(/:\d+\/$/);
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("onboarding legacy age-only drafts retain measurements but require birthday and fresh Review acknowledgement", async ({ browser }, info) => {
  const account = await createLocalAccount(`legacy-review-${info.project.name}`);
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  try {
    const page = await context.newPage();
    await page.goto("/onboarding");
    await fillAboutYou(page);
    await goToReview(page);
    await acknowledgement(page).check();
    // Rewrite only this disposable account's draft to the pre-acknowledgement shape.
    await expect.poll(() => page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("calicoach-drafts", 1);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<boolean>((resolve, reject) => {
          const transaction = db.transaction("drafts", "readwrite");
          const store = transaction.objectStore("drafts");
          const request = store.openCursor();
          let changed = false;
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            const row = cursor.value;
            if (row.value?.draftType === "onboarding" && row.value.payload.reviewAcknowledgementVersion) {
              delete row.value.payload.reviewAcknowledgementVersion;
              delete row.value.payload.birthday;
              row.value.payload.age = "30";
              row.value.payload.targetEligibility = "eligible";
              cursor.update(row); changed = true;
            }
            cursor.continue();
          };
          transaction.oncomplete = () => resolve(changed); transaction.onerror = () => reject(transaction.error);
        });
      } finally { db.close(); }
    })).toBe(true);
    await page.reload();
    await expect(page.getByText("Onboarding draft restored from this device.")).toBeVisible();
    await expect(page.getByLabel("Height (cm)", { exact: true })).toHaveValue("180");
    await expect(page.getByLabel("Weight (kg)", { exact: true })).toHaveValue("66.2");
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "About you", exact: true })).toBeVisible();
    await expect(page.getByRole("listbox", { name: "Year", exact: true }).getByRole("option", { selected: true })).toHaveText("—");
    await selectBirthday(page, 30);
    await goToReview(page);
    await expect(acknowledgement(page)).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Create my plan", exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Your estimated daily food target", exact: true })).toHaveCount(0);
  } finally { await context.close(); await deleteLocalAccount(account); }
});
