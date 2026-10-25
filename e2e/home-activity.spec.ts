import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createAuthenticatedContext, createLocalAccount, deleteLocalAccount } from "./local-account";
import { createSupabaseRepository } from "../src/services/supabaseRepository";
import { addDays, formatFullDate, startOfWeek, todayKey, fromKey } from "../src/utility/dates";
import type { Database } from "../src/types/database.generated";
import type { UserProfile, Weekday } from "../src/types/domain";

test("Home activity cards share step drafts, modal saves, retry and date-specific editing", async ({ browser }, info) => {
  test.setTimeout(240_000);
  const account = await createLocalAccount("home-activity");
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword(account);
  if (login.error || !login.data.user) throw login.error;
  const repository = createSupabaseRepository(client);
  const profile: UserProfile = { id: login.data.user.id, name: "Activity Test", age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: ((fromKey(todayKey()).getDay() + 6) % 7) as Weekday, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: "No restrictions", allergies: [], notificationsEnabled: false, targetEligibility: "eligible", dailyStepTarget: 8000, createdAt: new Date().toISOString() };
  const context = await createAuthenticatedContext(browser, process.env.PLAYWRIGHT_BASE_URL!, account);
  const page = await context.newPage();
  try {
    await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: crypto.randomUUID() });
    const today = todayKey(), yesterday = addDays(today, -1), week = startOfWeek(today, profile.weekStartsOn);
    await page.goto("/");
    const steps = page.getByRole("region", { name: "Steps", exact: true });
    const workouts = page.getByRole("region", { name: "Workouts", exact: true });
    await expect(workouts).toHaveCount(1);
    await expect(workouts.locator("dl dt")).toHaveText(["Completed:","Scheduled:","Est. kcal:"]);
    await expect(steps.locator("dl dt")).toHaveText(["Steps:","Walk time:","Est. kcal:"]);
    await expect(steps.locator("dl dd").first()).toHaveAttribute("aria-label", /0 of 8,000 steps shown as a placeholder/);
    await steps.locator("dl dd").last().focus();
    await expect(page.getByRole("tooltip", { name: `Walking energy not logged (${formatFullDate(today)})`, exact: true })).toBeVisible();
    await page.keyboard.press("Escape"); await expect(page.getByRole("tooltip", { name: `Walking energy not logged (${formatFullDate(today)})`, exact: true })).toHaveCount(0);
    const strip = steps.getByRole("group", { name: "Choose a day", exact: true });
    const days = strip.getByRole("button");
    await expect(days).toHaveCount(7);
    const dates = await days.evaluateAll(elements => elements.map(element => element.getAttribute("data-date")));
    expect(dates).toEqual(Array.from({ length: 7 }, (_, index) => addDays(week, index)));
    await expect(days.filter({ hasText: "Today" })).toHaveAttribute("aria-current", "date");
    for (const date of dates as string[]) {
      const tile = strip.getByRole("button", { name: formatFullDate(date), exact: true });
      await tile.click();
      await expect(tile).toHaveAttribute("aria-pressed", "true");
      await expect(steps.locator('button[aria-pressed="true"]')).toHaveCount(1);
      await expect(steps.locator("time")).toHaveAttribute("datetime", date);
      await expect(steps.getByRole("status")).toContainText(formatFullDate(date));
      if (date > today) {
        await expect(steps.getByRole("img", { name: /upcoming/ })).toHaveAttribute("aria-label", /upcoming/);
        await expect(steps.locator("dl dd > span:first-child")).toHaveText(["—","—","—"]);
        await expect(steps.getByRole("button", { name: /^(Add|Edit) steps for/ })).toHaveCount(0);
      } else {
        await expect(steps.getByRole("button", { name: `Add steps for ${formatFullDate(date)}`, exact: true })).toBeVisible();
        await expect(steps.locator("dl dd").first()).toHaveAttribute("aria-label", /0 of 8,000 steps shown as a placeholder/);
      }
    }
    expect((await repository.load())!.dailySteps).toHaveLength(0);
    await strip.getByRole("button", { name: formatFullDate(today), exact: true }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [320,367,385,390,403,414,416,421,462,469,582,594,760,1440]) {
      await page.setViewportSize({ width, height: 930 });
      for (const enlarged of [false,true]) {
        const style = enlarged ? await page.addStyleTag({ content: "html { font-size: 200% !important; }" }) : null;
        for (const card of [workouts,steps]) {
          const geometry = await card.locator("[data-activity-summary]").evaluate(element => {
            const ring = element.querySelector("svg")!.getBoundingClientRect(), metrics = element.querySelector("dl")!.getBoundingClientRect();
            return { difference: Math.abs(ring.top + ring.height / 2 - metrics.top - metrics.height / 2), side: ring.right <= metrics.left, size: ring.width };
          });
          const stack = await card.locator("dl").evaluate(element => ({ gap: parseFloat(getComputedStyle(element).rowGap), expected: parseFloat(getComputedStyle(document.documentElement).fontSize) / 4,
            heights: [...element.children].map(child => child.getBoundingClientRect().height) }));
          expect(stack.gap).toBeCloseTo(stack.expected, 2);
          if (width === 421 && !enlarged) expect(stack.heights).toEqual([20,20,20]);
          for (const metric of await card.locator("dl > div").all()) {
            const bounds = await metric.evaluate(element => {
              const label = element.querySelector("dt")!.getBoundingClientRect(), value = element.querySelector("dd")!.getBoundingClientRect();
              return { height: element.getBoundingClientRect().height, contentHeight: Math.max(label.height,value.height), side: label.right <= value.left, centers: Math.abs(label.top + label.height / 2 - value.top - value.height / 2) };
            });
            expect(bounds.height).toBeLessThanOrEqual(bounds.contentHeight + 1); expect(bounds.side).toBe(true); expect(bounds.centers).toBeLessThanOrEqual(2);
          }
          expect(geometry.difference).toBeLessThanOrEqual(2); expect(geometry.side).toBe(true); expect(geometry.size).toBe(116);
        }
        const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
          elements: [...document.querySelectorAll("main *")].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0,8).map(element => ({ tag: element.tagName, text: element.textContent?.slice(0,45), right: element.getBoundingClientRect().right })) }));
        expect(overflow.scroll, JSON.stringify({ width, enlarged, overflow })).toBeLessThanOrEqual(overflow.width);
        await page.evaluate(() => window.scrollTo(0,0));
        for (const date of [dates[6], dates[0], today] as string[]) {
          const tile = strip.getByRole("button", { name: formatFullDate(date), exact: true });
          await tile.evaluate(element => (element as HTMLButtonElement).click());
          await expect(tile).toHaveAttribute("aria-pressed", "true");
          await expect.poll(() => tile.evaluate(element => {
            const bounds = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect();
            return bounds.left >= parent.left && bounds.right <= parent.right;
          })).toBe(true);
          const bounds = await tile.boundingBox();
          expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
          expect(await page.evaluate(() => scrollY)).toBe(0);
        }
        const scrolling = await strip.evaluate(element => ({ overflow: getComputedStyle(element).overflowX, scrollbar: getComputedStyle(element).scrollbarWidth }));
        expect(scrolling.overflow).toBe("auto"); expect(scrolling.scrollbar).not.toBe("none");
        for (const tile of await days.all()) {
          expect(await tile.evaluate(element => {
            const box = element.getBoundingClientRect();
            return [...element.children].every(child => { const text = child.getBoundingClientRect(); return text.left >= box.left && text.right <= box.right; });
          })).toBe(true);
        }
        if (style) await style.evaluate(element => element.parentNode?.removeChild(element));
      }
    }
    await page.setViewportSize(info.project.use.viewport ?? { width: 390, height: 930 });
    const action = page.locator(`#home-steps-${today}`);
    await action.click();
    let modal = page.getByRole("dialog", { name: "Add steps", exact: true });
    await expect(modal.getByText(formatFullDate(today), { exact: true })).toBeVisible();
    await modal.getByLabel("Steps", { exact: true }).fill("6500");
    await modal.getByLabel("Walking minutes (optional)").fill("35");
    const footerGeometry = await modal.evaluate(element => {
      const body = element.querySelector("[data-modal-body]")!.getBoundingClientRect();
      const footer = element.querySelector("footer")!.getBoundingClientRect();
      const button = element.querySelector("footer button")!, box = button.getBoundingClientRect();
      return { bodyBottom: body.bottom, footerTop: footer.top, hit: button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
    });
    expect(footerGeometry.bodyBottom).toBeLessThanOrEqual(footerGeometry.footerTop + 1);
    expect(footerGeometry.hit).toBe(true);
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(action).toBeFocused();
    await page.goto("/activity");
    await expect(page.getByLabel("Steps", { exact: true })).toHaveValue("6500");
    await expect(page.getByLabel("Walking minutes (optional)")).toHaveValue("35");
    await page.goto("/"); await action.click();
    modal = page.getByRole("dialog", { name: "Add steps", exact: true });
    await expect(modal.getByLabel("Steps", { exact: true })).toHaveValue("6500");
    await modal.getByRole("button", { name: "About Walking minutes", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Walking minutes", exact: true })).toBeVisible();
    await page.keyboard.press("Escape"); await expect(modal).toBeVisible();
    let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/rest/v1/rpc/save_daily_steps", async route => { await hold; await route.abort("failed"); });
    await modal.getByRole("button", { name: "Save steps", exact: true }).click();
    await expect(modal.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape"); await expect(modal).toBeVisible(); release();
    await expect(modal.getByRole("alert")).toBeVisible();
    await expect(modal.getByLabel("Steps", { exact: true })).toHaveValue("6500");
    await page.unroute("**/rest/v1/rpc/save_daily_steps");
    await modal.getByRole("button", { name: "Save steps", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^(Add|Edit) steps$/ })).toHaveCount(0);
    await expect(action).toBeFocused();
    await expect(steps.getByRole("img", { name: `Daily step target progress for ${formatFullDate(today)}: 81%` })).toBeVisible();
    await expect(steps.locator("dl dd").nth(1)).toHaveText("35 mins");
    await expect(steps.locator("dl dd").last()).toHaveText(/≈\d+–\d+/);
    await strip.getByRole("button", { name: formatFullDate(yesterday), exact: true }).click();
    await expect(steps.locator("dl dd").nth(1)).toHaveText("—");
    await expect(steps.locator("dl dd").last()).toHaveText("—");
    await strip.getByRole("button", { name: formatFullDate(today), exact: true }).click();
    await expect(steps.locator("dl dd").nth(1)).toHaveText("35 mins");
    await action.click(); modal = page.getByRole("dialog", { name: "Edit steps", exact: true });
    await expect(modal.getByText("Your unfinished step entry was restored.", { exact: true })).toHaveCount(0);
    await modal.getByLabel("Steps", { exact: true }).fill("7000");
    const savedEntry = (await repository.load())!.dailySteps.find(entry => entry.date === today)!;
    await repository.saveDailySteps({ date: today, steps: 9000, walkingMinutes: 35, expectedRevision: savedEntry.revision, idempotencyKey: crypto.randomUUID() });
    await modal.getByRole("button", { name: "Save steps", exact: true }).click();
    await expect(modal.getByText(/This date was changed elsewhere/)).toBeVisible();
    await expect(modal.getByLabel("Steps", { exact: true })).toHaveValue("7000");
    await modal.getByRole("button", { name: "Reapply my draft", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^(Add|Edit) steps$/ })).toHaveCount(0);
    await expect.poll(async () => (await repository.load())!.dailySteps.find(entry => entry.date === today)?.steps).toBe(7000);
    await action.click(); modal = page.getByRole("dialog", { name: "Edit steps", exact: true });
    await modal.getByLabel("Steps", { exact: true }).fill("0"); await modal.getByLabel("Walking minutes (optional)").fill("0");
    await modal.getByRole("button", { name: "Save steps", exact: true }).click();
    await expect(steps.getByRole("img", { name: `Daily step target progress for ${formatFullDate(today)}: 0%` })).toBeVisible();
    await expect(steps.locator("dl dd").nth(1)).toHaveText("0 mins");
    await page.goto("/activity"); await expect(page.getByLabel("Steps", { exact: true })).toHaveValue("0");
    await expect(page.getByRole("heading", { name: "0 steps saved", exact: true })).toBeVisible();
    await page.goto("/");
    if (yesterday >= week) {
      await strip.getByRole("button", { name: formatFullDate(yesterday), exact: true }).click();
      await page.locator(`#home-steps-${yesterday}`).click();
      modal = page.getByRole("dialog", { name: "Add steps", exact: true });
      await modal.getByLabel("Steps", { exact: true }).fill("1234"); await modal.getByRole("button", { name: "Save steps", exact: true }).click();
      await expect(steps.locator("dl dd").first()).toContainText("1,234");
      await expect(steps.getByRole("img", { name: `Daily step target progress for ${formatFullDate(yesterday)}: 15%`, exact: true })).toBeVisible();
      await expect(steps.locator("dl dd").nth(1)).toHaveText("—");
      await expect(steps.locator("dl dd").last()).toHaveText("—");
      await expect(page.locator(`#home-steps-${yesterday}`)).toBeFocused();
      await strip.getByRole("button", { name: formatFullDate(today), exact: true }).click();
      await expect(steps.locator("dl dd").first()).toContainText("0 / 8,000");
    }
    await action.click(); modal = page.getByRole("dialog", { name: "Edit steps", exact: true });
    for (const width of [320,462,760,1440]) {
      await page.setViewportSize({ width, height: 930 });
      const style = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await modal.getByRole("button", { name: "Save steps", exact: true }).focus();
      await expect(modal.getByRole("button", { name: "Save steps", exact: true })).toBeInViewport();
      await style.evaluate(element => element.parentNode?.removeChild(element));
    }
    await modal.getByRole("button", { name: "Remove entry", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^(Add|Edit) steps$/ })).toHaveCount(0);
    await expect(action).toBeFocused();
    await expect.poll(async () => (await repository.load())!.dailySteps.some(entry => entry.date === today)).toBe(false);
    await page.setViewportSize({ width: 462, height: 930 });
    await page.mouse.move(0,0); await page.keyboard.press("Escape");
    await steps.screenshot({ path: `output/home-steps-redesign-${info.project.name}.png` });
    await workouts.screenshot({ path: `output/home-workouts-redesign-${info.project.name}.png` });

    // Date-only clock changes leave timers/auth untouched while exercising the
    // visibility refresh used when returning to Home after midnight.
    const setCalendar = async (month: number, day: number, year = 2026) => {
      await page.clock.setFixedTime(await page.evaluate(({ year, month, day }) => new Date(year, month - 1, day, 12).getTime(), { year, month, day }));
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    };
    await setCalendar(12,31,2025);
    await expect(steps.locator('button[aria-pressed="true"]')).toHaveAttribute("data-date", "2025-12-31");
    await page.locator("#home-steps-2025-12-31").click();
    modal = page.getByRole("dialog", { name: "Add steps", exact: true });
    await modal.getByLabel("Steps", { exact: true }).fill("42");
    await setCalendar(1,1);
    await expect(modal.getByText(formatFullDate("2025-12-31"), { exact: true })).toBeVisible();
    await expect(modal.getByLabel("Steps", { exact: true })).toHaveValue("42");
    await modal.getByRole("button", { name: "Cancel", exact: true }).click();
    const retained = "2025-12-31" >= startOfWeek("2026-01-01", profile.weekStartsOn) ? "2025-12-31" : "2026-01-01";
    await expect(steps.locator('button[aria-pressed="true"]')).toHaveAttribute("data-date", retained);
    await expect(page.locator(`#home-steps-${retained}`)).toBeFocused();
    await expect(strip.getByRole("button", { name: formatFullDate("2026-01-01"), exact: true })).toContainText("Today");
    await setCalendar(1,8);
    await expect(steps.locator('button[aria-pressed="true"]')).toHaveAttribute("data-date", "2026-01-08");
    const past = addDays("2026-01-08", -1);
    if (past >= startOfWeek("2026-01-08", profile.weekStartsOn)) {
      const pastTile = strip.getByRole("button", { name: formatFullDate(past), exact: true });
      await pastTile.focus(); await page.keyboard.press("Space");
      await expect(pastTile).toHaveAttribute("aria-pressed", "true");
      expect(await pastTile.evaluate(element => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThan(0);
    }
    if (startOfWeek("2026-01-07", profile.weekStartsOn) === startOfWeek("2026-01-08", profile.weekStartsOn)) {
      await strip.getByRole("button", { name: formatFullDate("2026-01-08"), exact: true }).click();
      await page.locator("#home-steps-2026-01-08").click();
      modal = page.getByRole("dialog", { name: "Add steps", exact: true });
      await setCalendar(1,7);
      await expect(modal.getByText(formatFullDate("2026-01-08"), { exact: true })).toBeVisible();
      await modal.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(steps.getByRole("button", { name: /^(Add|Edit) steps for/ })).toHaveCount(0);
      await expect(strip.getByRole("button", { name: formatFullDate("2026-01-08"), exact: true })).toBeFocused();
    }
  } finally { await page.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); await deleteLocalAccount(account); }
});
