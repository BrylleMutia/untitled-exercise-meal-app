import { mkdir } from "node:fs/promises";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createLocalAccount, createAuthenticatedContext, deleteLocalAccount, type LocalAccount } from "./local-account";
import { chooseRecipe, reviewRecipe, recipeRow } from "./generation-helpers";
import { createSupabaseRepository } from "../src/services/supabaseRepository";
import type { Database } from "../src/types/database.generated";
import type { UserProfile } from "../src/types/domain";

async function fixture(account: LocalAccount, viewer: boolean) {
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword(account);
  if (login.error || !login.data.user) throw login.error;
  const repository = createSupabaseRepository(client);
  const profile: UserProfile = { id: login.data.user.id, name: "Same name", age: 30, sex: "female", heightCm: 165, weightKg: 65, units: "metric", weekStartsOn: 0, experience: "beginner", equipment: ["none"], daysPerWeek: 3, sessionMinutes: 30, goal: "maintain", dietaryPattern: viewer ? "Vegan Keto-style" : "No restrictions", allergies: viewer ? ["soy"] : ["cucumber"], cookingTimeMinutes: 15, mealBudget: 4, notificationsEnabled: false, targetEligibility: "eligible", createdAt: new Date().toISOString() };
  await repository.completeOnboarding({ profile, currentSnapshot: (await repository.load())!, idempotencyKey: crypto.randomUUID() });
  return { client, repository };
}

async function goToStep(dialog: Locator, target: number) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const count = await dialog.locator("[data-stepper] p").innerText();
    const current = Number(count.match(/step (\d+) of/i)?.[1]);
    if (current === target) return;
    const action = dialog.getByRole("button", { name: current < target ? "Continue" : "Back", exact: true });
    await expect(action).toBeEnabled({ timeout: 45000 });
    await action.click();
    await expect(dialog.locator("[data-stepper] h3")).toBeFocused();
  }
  throw new Error(`Could not reach generation step ${target}`);
}

async function expandReview(section: Locator) {
  const details = section.locator("details");
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
}

async function checkReviewDisclosures(page: Page, dialog: Locator, grouped: boolean) {
  const titles = ["Recipe warnings", ...(grouped ? ["Review unfilled meals"] : []), "Daily preference warnings"];
  const opened: string[] = [];
  for (const title of titles) {
    const section = dialog.getByRole("region", { name: title, exact: true });
    const details = section.locator("details"), summary = section.locator("summary");
    await expect(details).not.toHaveAttribute("open");
    await summary.focus(); await page.keyboard.press("Space");
    await expect(details).toHaveAttribute("open", "");
    const collapse = section.getByRole("button", { name: `Collapse all ${title.toLowerCase()}`, exact: true });
    await expect.poll(() => collapse.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await collapse.click(); await expect(details).not.toHaveAttribute("open");
    for (const other of opened) await expect(dialog.getByRole("region", { name: other, exact: true }).locator("details")).toHaveAttribute("open", "");
    await expect(summary).toBeFocused(); await expect(summary).toBeInViewport();
    await page.keyboard.press("Enter"); await expect(details).toHaveAttribute("open", "");
    opened.push(title);
  }
}

async function checkReviewLayout(page: Page, dialog: Locator, grouped: boolean, name: string) {
  const viewport = page.viewportSize()!;
  const titles = ["Recipe warnings", ...(grouped ? ["Review unfilled meals"] : []), "Daily preference warnings"];
  await mkdir("output/review-disclosures", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 409, 1440]) {
    await page.setViewportSize({ width, height: 930 });
    for (const enlarged of [false, true]) {
      await page.evaluate(value => { document.documentElement.style.fontSize = value ? "200%" : ""; }, enlarged);
      for (const title of titles) {
        const section = dialog.getByRole("region", { name: title, exact: true });
        await expandReview(section);
        await expect.poll(() => dialog.locator("[data-modal-body]").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await section.getByRole("button", { name: `Collapse all ${title.toLowerCase()}`, exact: true }).click();
        await expect(section.locator("summary")).toBeFocused(); await expect(section.locator("summary")).toBeInViewport();
      }
      await expect(dialog.getByRole("checkbox", { name: /^I reviewed the assignments/ })).toBeChecked();
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    if (width === 390 || width === 409) await page.screenshot({ path: `output/review-disclosures/${name}-${width}.png` });
  }
  await page.setViewportSize(viewport);
}

async function checkSuccessSummary(page: Page, dialog: Locator, project: string) {
  const graphic = dialog.locator("[data-generation-success-animation]");
  const title = dialog.getByRole("heading", { name: "You're all set!", exact: true });
  const generator = dialog.getByText(/^Generated by /);
  const canvas = graphic.locator("canvas");
  await expect(title).toHaveCount(1);
  await expect(dialog.locator("header h2")).toHaveCount(0);
  await expect(graphic.locator("img")).toBeVisible();
  await page.route("**/animations/check-done.lottie", route => route.abort());
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(canvas).toHaveAttribute("data-playing", "false");
  await expect(graphic.locator("img")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
  await page.unroute("**/animations/check-done.lottie");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-lottie-loop", "false");
  const checksum = () => canvas.evaluate(node => {
    const image = node as HTMLCanvasElement;
    const data = image.getContext("2d")!.getImageData(0, 0, image.width, image.height).data;
    let hash = 0; for (let i = 0; i < data.length; i += 4) hash = (hash * 31 + data[i] + data[i + 3]) | 0; return hash;
  });
  const start = await checksum();
  await expect.poll(checksum).not.toBe(start);
  await expect(canvas).toHaveAttribute("data-lottie-complete", "true", { timeout: 15000 });
  const finished = await checksum();
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.evaluate(() => { delete (document as unknown as { visibilityState?: string }).visibilityState; document.dispatchEvent(new Event("visibilitychange")); });
  await expect(canvas).toHaveAttribute("data-playing", "false");
  expect(await checksum()).toBe(finished);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(canvas).toHaveCount(0);
  await mkdir("output/generation-success", { recursive: true });
  for (const width of [320, 409, 438, 1440]) {
    await page.setViewportSize({ width, height: 930 });
    for (const enlarged of [false, true]) {
      await page.evaluate(value => { document.documentElement.style.fontSize = value ? "200%" : ""; }, enlarged);
      await dialog.locator("[data-modal-body]").evaluate(node => { node.scrollTop = 0; });
      const h = await title.boundingBox(), a = await graphic.boundingBox(), g = await generator.boundingBox(), d = await dialog.boundingBox();
      expect(h && a && g && d).toBeTruthy();
      expect(Math.abs(h!.x + h!.width / 2 - d!.x - d!.width / 2)).toBeLessThan(2);
      expect(Math.abs(a!.x + a!.width / 2 - d!.x - d!.width / 2)).toBeLessThan(2);
      expect(h!.y + h!.height).toBeLessThanOrEqual(a!.y);
      expect(a!.y + a!.height).toBeLessThanOrEqual(g!.y);
      await expect.poll(() => dialog.locator("[data-modal-body]").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const done = dialog.getByRole("button", { name: "Done", exact: true }); await done.focus(); await expect(done).toBeInViewport();
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    await dialog.locator("[data-modal-body]").evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: `output/generation-success/summary-${width}-${project}.png` });
  }
}

async function checkDraftNotice(page: Page, dialog: Locator, name: string) {
  const viewport = page.viewportSize()!;
  const discard = dialog.getByRole("button", { name: "Discard draft", exact: true });
  await mkdir("output/generation-draft", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 409, 1440]) {
    await page.setViewportSize({ width, height: 930 });
    for (const enlarged of [false, true]) {
      await page.evaluate(value => { document.documentElement.style.fontSize = value ? "200%" : ""; }, enlarged);
      await discard.scrollIntoViewIfNeeded(); await discard.focus();
      await expect(discard).toBeFocused(); await expect(discard).toBeInViewport();
      await expect.poll(() => discard.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    if (width === 409) await page.screenshot({ path: `output/generation-draft/${name}.png` });
  }
  await page.setViewportSize(viewport);
}

test("themed pan loaders adapt to available width and preserve connection, draft and preview retries", async ({ browser }, info) => {
  test.setTimeout(240000);
  const account = await createLocalAccount("pan-loader");
  const context = await createAuthenticatedContext(browser, info.project.use.baseURL!, account);
  let releaseConnection = () => {};
  let releasePreview = () => {};
  try {
    const owner = await fixture(account, false);
    const invite = await owner.client.rpc("cooking_group_command", { p_payload: { action: "invite", grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: crypto.randomUUID() } });
    if (invite.error) throw invite.error;
    const page = await context.newPage();
    await page.setViewportSize({ width: 409, height: 930 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/nutrition");
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Next week", exact: true }).click();
    const generate = page.getByRole("button", { name: "Generate", exact: true });
    await expect(generate).toBeEnabled();
    const connectionGate = new Promise<void>(resolve => { releaseConnection = resolve; });
    let failConnection = false;
    const connectionEndpoint = "**/rest/v1/rpc/get_cooking_group_week";
    await page.route(connectionEndpoint, async route => {
      await connectionGate;
      if (failConnection) return route.fulfill({ status: 503, json: { message: "Connection unavailable" } });
      await route.continue();
    });
    await generate.click();
    const dialog = page.getByRole("dialog", { name: "Generate plan", exact: true });
    const loader = dialog.locator("[data-loading-indicator]").filter({ hasText: "Loading cooking group…" });
    const canvas = loader.locator("canvas");
    await expect(loader).toHaveAttribute("data-loading-layout", "pan");
    await expect(canvas).toBeVisible();
    const checksum = () => canvas.evaluate(node => {
      const element = node as HTMLCanvasElement;
      const data = element.getContext("2d")!.getImageData(0, 0, element.width, element.height).data;
      let hash = 0; for (let i = 0; i < data.length; i += 4) hash = (hash * 31 + data[i] + data[i + 3]) | 0; return hash;
    });
    const first = await checksum();
    await expect.poll(checksum).not.toBe(first);
    await loader.evaluate(node => { node.style.width = "239px"; });
    await expect(loader).toHaveAttribute("data-loading-layout", "compact");
    await expect(canvas).toHaveCount(0);
    await loader.evaluate(node => { node.style.width = "240px"; });
    await expect(loader).toHaveAttribute("data-loading-layout", "pan");
    await expect(canvas).toBeVisible();
    await loader.evaluate(node => { node.style.marginTop = "2000px"; });
    await expect(canvas).toHaveAttribute("data-playing", "false");
    await loader.evaluate(node => { node.style.marginTop = ""; });
    await loader.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveAttribute("data-playing", "true");
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
    await expect(canvas).toHaveAttribute("data-playing", "false");
    await page.evaluate(() => { delete (document as unknown as { visibilityState?: string }).visibilityState; document.dispatchEvent(new Event("visibilitychange")); });
    await expect(canvas).toHaveAttribute("data-playing", "true");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(canvas).toHaveCount(0);
    await expect(loader.locator("img")).toBeVisible();
    await mkdir("output/pan-loader", { recursive: true });
    await loader.evaluate(node => { node.style.width = ""; });
    for (const width of [320, 409, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      for (const enlarged of [false, true]) {
        await page.evaluate(value => { document.documentElement.style.fontSize = value ? "200%" : ""; }, enlarged);
        await expect(loader.locator("img")).toHaveCSS("width", "96px");
        await expect.poll(() => dialog.locator("[data-modal-body]").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      await page.screenshot({ path: `output/pan-loader/connection-${width}-${info.project.name}.png` });
    }
    await page.setViewportSize({ width: 409, height: 930 });
    await dialog.getByRole("button", { name: "Close", exact: true }).focus();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await page.keyboard.press("Enter"); await expect(dialog).toHaveCount(0);
    await generate.click(); await expect(loader).toBeVisible();
    failConnection = true; releaseConnection();
    await expect(dialog.getByRole("alert")).toContainText("Connection unavailable");
    await expect(loader).toHaveCount(0);
    await expect(dialog.getByRole("heading", { name: "Choose days", exact: true })).toHaveCount(0);
    await page.unroute(connectionEndpoint);
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>(resolve => { releaseRetry = resolve; });
    await page.route(connectionEndpoint, async route => { await retryGate; await route.continue(); });
    const retry = dialog.getByRole("button", { name: "Retry connection", exact: true });
    await retry.click(); await expect(retry).toBeDisabled(); await expect(loader).toBeVisible();
    // Delay only generation draft reads while leaving the real IndexedDB request intact.
    await page.evaluate(() => {
      const host = window as unknown as { releaseGenerationDraft: () => void };
      const gate = new Promise<void>(resolve => { host.releaseGenerationDraft = resolve; });
      const original = IDBObjectStore.prototype.get;
      const setter = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "onsuccess")!.set!;
      IDBObjectStore.prototype.get = function(key) {
        const request = original.call(this, key);
        if (String(key).includes("nutrition-group-generation:")) Object.defineProperty(request, "onsuccess", { set(handler) { setter.call(request, async (event: Event) => { await gate; handler.call(request, event); }); } });
        return request;
      };
    });
    releaseRetry();
    await expect(dialog.getByText("Restoring plan draft…", { exact: true })).toBeVisible();
    await page.evaluate(() => (window as unknown as { releaseGenerationDraft: () => void }).releaseGenerationDraft());
    await expect(dialog.getByText("Restoring plan draft…", { exact: true })).toHaveCount(0);
    await expect(dialog.locator("[data-stepper] h3")).toHaveText("Setup");
    await page.unroute(connectionEndpoint);
    await goToStep(dialog, 2);
    const previewEndpoint = "**/functions/v1/cooking-group-preview";
    const previewGate = new Promise<void>(resolve => { releasePreview = resolve; });
    await page.route(previewEndpoint, async route => { await previewGate; await route.continue(); });
    await dialog.getByRole("button", { name: "Add recipe", exact: true }).click();
    await expect(dialog.getByText("Generating plan preview…", { exact: true })).toBeVisible();
    await goToStep(dialog, 3);
    await expect(dialog.locator('[aria-label="Daily planned preview"]').getByText("Generating plan preview…", { exact: true })).toBeVisible();
    await expect(dialog.locator('[aria-label="Daily planned preview"]').getByRole("listitem")).toHaveCount(0);
    releasePreview();
    await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeEnabled({ timeout: 45000 });
    await expect(dialog.getByText("Generating plan preview…", { exact: true })).toHaveCount(0);
    await goToStep(dialog, 4);
    await expect(dialog.getByText("Updating cooking requirements…", { exact: true })).toHaveCount(0);
    await page.unroute(previewEndpoint);
    let releaseCooking!: () => void;
    const cookingGate = new Promise<void>(resolve => { releaseCooking = resolve; releasePreview = resolve; });
    await page.route(previewEndpoint, async route => { await cookingGate; await route.continue(); });
    await page.route(connectionEndpoint, async route => {
      const response = await route.fetch(); const json = await response.json(); json.revision++;
      await route.fulfill({ response, json });
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const cookingLoader = dialog.getByText("Updating cooking requirements…", { exact: true });
    await expect(cookingLoader).toBeVisible();
    await expect(dialog.getByRole("listitem")).toHaveCount(0);
    releaseCooking(); await expect(cookingLoader).toHaveCount(0, { timeout: 45000 });
    await page.unroute(previewEndpoint); await page.unroute(connectionEndpoint);
    await dialog.getByRole("button", { name: "Close generate plan", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  } finally { releaseConnection(); releasePreview(); await context.close(); await deleteLocalAccount(account); }
});

test("pan animation and runtime failures preserve usable loading feedback", async ({ browser }, info) => {
  const account = await createLocalAccount("pan-fallback");
  const context = await createAuthenticatedContext(browser, info.project.use.baseURL!, account);
  let release = () => {};
  try {
    await fixture(account, false);
    for (const asset of ["pan-loading.lottie", "dotlottie-player.wasm"]) {
      const page = await context.newPage();
      await page.setViewportSize({ width: 409, height: 930 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.route(`**/animations/${asset}`, route => route.abort());
      await page.goto("/nutrition");
      const generate = page.getByRole("button", { name: "Generate", exact: true }); await expect(generate).toBeEnabled();
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route("**/rest/v1/rpc/get_cooking_group_week", async route => { await gate; await route.continue(); });
      await generate.click();
      const dialog = page.getByRole("dialog", { name: "Generate plan", exact: true });
      const loader = dialog.locator("[data-loading-indicator]");
      await expect(loader).toContainText("Loading cooking group…");
      await expect(loader.locator("canvas")).toHaveAttribute("data-playing", "false");
      await expect(loader.locator("img")).toBeVisible();
      await dialog.getByRole("button", { name: "Close", exact: true }).click(); await expect(dialog).toHaveCount(0);
      release(); await page.close();
    }
  } finally { release(); await context.close(); await deleteLocalAccount(account); }
});

test("classic recipe stack teaches left skip and right add with touch, mouse, undo and keyboard alternatives", async ({ browser }, info) => {
  test.setTimeout(180000);
  const account = await createLocalAccount("recipe-swiper");
  const context = await createAuthenticatedContext(browser, info.project.use.baseURL!, account);
  try {
    await fixture(account, false);
    const page = await context.newPage(); await page.setViewportSize({ width: 409, height: 930 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/nutrition");
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Next week", exact: true }).click();
    const generate = page.getByRole("button", { name: "Generate", exact: true }); await expect(generate).toBeEnabled(); await generate.click();
    const dialog = page.getByRole("dialog", { name: "Generate plan", exact: true });
    await goToStep(dialog, 2);
    const card = dialog.locator("[data-swiper-card]");
    const next = dialog.getByRole("button", { name: "Continue", exact: true });
    const add = dialog.getByRole("button", { name: "Add recipe", exact: true });
    const skip = dialog.getByRole("button", { name: "Skip recipe", exact: true });
    await expect(next).toBeDisabled(); await expect(dialog.locator("[data-card-swiper]")).toContainText("0 added");
    await add.scrollIntoViewIfNeeded();
    await expect(card).toHaveAttribute("data-hint", "skip"); await expect(skip).toHaveAttribute("data-highlighted", "true");
    await expect(card).toHaveAttribute("data-hint", "add"); await expect(add).toHaveAttribute("data-highlighted", "true");
    await expect(dialog.locator("[data-card-swiper]")).toContainText("0 added");
    await expect(next).toBeDisabled();
    const first = await card.locator("h4").innerText();
    const mobile = info.project.name === "mobile";
    const session = mobile ? await context.newCDPSession(page) : null;
    async function dragCard(x: number, y = 0, cancel = false) {
      await card.scrollIntoViewIfNeeded(); const box = (await card.boundingBox())!;
      const start = { x: box.x + box.width / 2, y: Math.max(180, box.y + 65) };
      if (session) {
        await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
        for (let step = 1; step <= 6; step++) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + x * step / 6, y: start.y + y * step / 6 }] });
        await session.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
      } else {
        await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + x, start.y + y, { steps: 6 });
        if (cancel) await card.dispatchEvent("pointercancel", { pointerId: 1 });
        await page.mouse.up();
      }
      await expect(dialog.locator('[data-swiper-card][aria-busy="true"]')).toHaveCount(0);
    }
    await dragCard(20); await expect(card.locator("h4")).toHaveText(first); await expect(next).toBeDisabled();
    await dragCard(80, 0, true); await expect(card.locator("h4")).toHaveText(first); await expect(next).toBeDisabled();
    const beforeScroll = await dialog.locator("[data-modal-body]").evaluate(node => node.scrollTop);
    await dragCard(0, -100); await expect(card.locator("h4")).toHaveText(first); await expect(next).toBeDisabled();
    if (mobile) expect(await dialog.locator("[data-modal-body]").evaluate(node => node.scrollTop)).toBeGreaterThanOrEqual(beforeScroll);
    await dragCard(120); await expect(dialog.locator("[data-card-swiper]")).toContainText("1 added"); await expect(next).toBeEnabled();
    await dialog.getByRole("button", { name: "Undo", exact: true }).click(); await expect(card.locator("h4")).toHaveText(first); await expect(next).toBeDisabled();
    await dragCard(-120); await expect(recipeRow(dialog, first)).toContainText("Skipped"); await expect(next).toBeDisabled();
    await dialog.getByRole("button", { name: "Undo", exact: true }).click(); await expect(card.locator("h4")).toHaveText(first);
    await card.focus(); await page.keyboard.press("ArrowRight"); await expect(dialog.locator('[data-swiper-card][aria-busy="true"]')).toHaveCount(0);
    await expect(dialog.locator("[data-card-swiper]")).toContainText("1 added"); await expect(card).toBeFocused();
    await dialog.getByRole("button", { name: "Undo", exact: true }).click();
    await add.dblclick(); await expect(dialog.locator('[data-swiper-card][aria-busy="true"]')).toHaveCount(0);
    await expect(dialog.locator("[data-card-swiper]")).toContainText("1 added");
    await goToStep(dialog, 5); const ack = dialog.getByRole("checkbox", { name: /^I reviewed the assignments/ }); await ack.check();
    await dialog.getByRole("button", { name: "Edit recipes", exact: true }).click(); await chooseRecipe(dialog, first);
    await goToStep(dialog, 5); await expect(ack).toBeChecked();
    await goToStep(dialog, 2); await page.emulateMedia({ reducedMotion: "reduce" });
    await reviewRecipe(dialog, first); await expect(card).not.toHaveAttribute("data-hint");
    await expect(card).toHaveCSS("transition-duration", "0s");
    await page.keyboard.press("ArrowLeft"); await expect(next).toBeDisabled();
    await expect(dialog.locator("[data-card-swiper]")).toContainText("0 added");
    await dialog.getByRole("button", { name: "Undo", exact: true }).click(); await expect(next).toBeEnabled();
    await goToStep(dialog, 1); await goToStep(dialog, 2); await expect(card).not.toHaveAttribute("data-hint");
    await mkdir("output/recipe-swiper", { recursive: true });
    for (const width of [320, 409, 1440]) {
      await page.setViewportSize({ width, height: 930 });
      for (const enlarged of [false, true]) {
        await page.evaluate(value => { document.documentElement.style.fontSize = value ? "200%" : ""; }, enlarged);
        await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await expect.poll(() => dialog.locator("[data-modal-body]").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await add.scrollIntoViewIfNeeded(); await expect(add).toBeInViewport(); await expect(skip).toBeInViewport();
        await expect.poll(() => add.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
        for (const name of ["Select all", "Clear"]) {
          const bounds = await dialog.getByRole("group", { name: "Choose recipes", exact: true }).getByRole("button", { name, exact: true }).boundingBox();
          expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
        }
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: `output/recipe-swiper/personal-${width}-${info.project.name}.png` });
    }
  } finally { await context.close(); await deleteLocalAccount(account); }
});

test("personal and group restored drafts can be discarded without reviving old choices or previews", async ({ browser }, info) => {
  test.setTimeout(300000);
  const account = await createLocalAccount("discard-generation");
  const context = await createAuthenticatedContext(browser, info.project.use.baseURL!, account);
  let releasePreview = () => {};
  try {
    const owner = await fixture(account, false);
    const before = (await owner.repository.load())!;
    const page = await context.newPage();
    await page.goto("/nutrition");
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Next week", exact: true }).click();
    const generate = page.getByRole("button", { name: "Generate", exact: true });
    await expect(generate).toBeEnabled(); await generate.click();
    const dialog = page.getByRole("dialog", { name: "Generate plan", exact: true });
    const choices = dialog.getByRole("group", { name: "Choose recipes", exact: true });
    const discard = dialog.getByRole("button", { name: "Discard draft", exact: true });
    const ack = dialog.getByRole("checkbox", { name: /^I reviewed the assignments/ });
    const close = dialog.getByRole("button", { name: "Close generate plan", exact: true });
    await expect(discard).toHaveCount(0);
    await goToStep(dialog, 2);
    await choices.getByRole("button", { name: "Clear", exact: true }).click();
    const recipeName = await choices.locator("[data-swiper-card] h4").innerText();
    await chooseRecipe(dialog, recipeName);
    await goToStep(dialog, 5); await ack.check(); await close.click(); await generate.click();
    await expect(discard).toBeVisible(); await goToStep(dialog, 5);
    await expect(ack).not.toBeChecked(); await ack.check();
    await checkDraftNotice(page, dialog, `personal-${info.project.name}`);
    const otherDraftKey = `calicoach:draft:v1:${encodeURIComponent(before.userId)}:grocery-extra%3Auntouched`;
    await page.evaluate(key => {
      localStorage.setItem(key, "keep this unrelated draft");
      const remove = Storage.prototype.removeItem, deleteRecord = IDBObjectStore.prototype.delete;
      Storage.prototype.removeItem = function (name) {
        if (name.startsWith("calicoach:draft:v1:")) throw new DOMException("Deletion blocked for this test", "SecurityError");
        return remove.call(this, name);
      };
      IDBObjectStore.prototype.delete = function (key) {
        if (this.name === "drafts") throw new DOMException("Deletion blocked for this test", "SecurityError");
        return deleteRecord.call(this, key);
      };
      (window as Window & { restoreDraftDeletion?: () => void }).restoreDraftDeletion = () => {
        Storage.prototype.removeItem = remove; IDBObjectStore.prototype.delete = deleteRecord;
      };
    }, otherDraftKey);
    await discard.click();
    await expect(dialog.getByText("The draft could not be discarded on this device. Your choices are retained. Try again.")).toBeVisible();
    await expect(dialog.locator("[data-stepper] h3")).toHaveText("Review"); await expect(ack).toBeChecked();
    await page.evaluate(() => (window as Window & { restoreDraftDeletion?: () => void }).restoreDraftDeletion?.());
    await discard.focus(); await page.keyboard.press("Enter");
    await expect(dialog.getByText("Draft discarded. Start a new plan with the default choices.")).toBeVisible();
    await expect(dialog.locator("[data-stepper] h3")).toHaveText("Choose days");
    await expect(dialog.locator("[data-stepper] h3")).toBeFocused(); await expect(discard).toHaveCount(0);
    await expect.poll(() => dialog.locator("[data-modal-body]").evaluate(node => node.scrollTop)).toBe(0);
    await goToStep(dialog, 2); await expect(choices).toContainText("0 added");
    await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
    expect(await page.evaluate(key => localStorage.getItem(key), otherDraftKey)).toBe("keep this unrelated draft");
    expect((await owner.repository.load())!.mealPlan).toEqual(before.mealPlan);
    await close.click(); await generate.click(); await expect(discard).toHaveCount(0);
    await goToStep(dialog, 2);
    await choices.getByRole("button", { name: "Clear", exact: true }).click(); await chooseRecipe(dialog, recipeName);
    await close.click(); await generate.click(); await expect(discard).toBeVisible(); await close.click();

    const invite = await owner.client.rpc("cooking_group_command", { p_payload: { action: "invite", grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: crypto.randomUUID() } });
    if (invite.error) throw invite.error;
    const groupBefore = (await owner.repository.load())!.mealPlan;
    await page.reload();
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(generate).toBeEnabled(); await generate.click(); await expect(discard).toHaveCount(0);
    await dialog.getByRole("radio", { name: "Replace planned meals on selected days", exact: true }).check();
    const days = dialog.getByRole("group", { name: "Choose days", exact: true });
    await days.getByRole("button", { name: "Clear", exact: true }).click();
    await days.getByRole("checkbox").first().check();
    await goToStep(dialog, 2);
    await choices.getByRole("button", { name: "Clear", exact: true }).click(); await chooseRecipe(dialog, recipeName);
    await reviewRecipe(dialog, recipeName);
    const selectedBatch = choices.locator('input[type="number"]:enabled');
    await expect(selectedBatch).toHaveValue("1"); await selectedBatch.fill("3");
    await close.click(); await generate.click(); await expect(discard).toBeVisible(); await goToStep(dialog, 2);
    await reviewRecipe(dialog, recipeName); await expect(selectedBatch).toHaveValue("3");
    await checkDraftNotice(page, dialog, `group-${info.project.name}`);
    let completedPreview!: () => void;
    const held = new Promise<void>(resolve => { releasePreview = resolve; });
    const completed = new Promise<void>(resolve => { completedPreview = resolve; });
    const endpoint = "**/functions/v1/cooking-group-preview";
    await page.route(endpoint, async route => {
      if (!route.request().postDataJSON().recipes.some((value: { maxBatches: number }) => value.maxBatches === 4)) return route.continue();
      try { const response = await route.fetch(); await held; await route.fulfill({ response }); }
      finally { completedPreview(); }
    });
    const requested = page.waitForRequest(request => request.url().includes("/functions/v1/cooking-group-preview") && request.postDataJSON().recipes.some((value: { maxBatches: number }) => value.maxBatches === 4));
    await selectedBatch.fill("4"); await requested;
    await goToStep(dialog, 3);
    await expect(dialog.locator('[aria-label="Daily planned preview"]').getByRole("listitem")).toHaveCount(0);
    await discard.click();
    await expect(dialog.locator("[data-stepper] h3")).toHaveText("Setup");
    await expect(dialog.locator("[data-stepper] h3")).toBeFocused(); await expect(discard).toHaveCount(0);
    await expect(dialog.getByRole("radio", { name: "Fill empty meals", exact: true })).toBeChecked();
    expect(await days.locator('input[type="checkbox"]:checked').count()).toBe(7);
    await goToStep(dialog, 2);
    await expect(choices).toContainText("0 added");
    await expect(choices.getByRole("spinbutton")).toHaveValue("1");
    await chooseRecipe(dialog, recipeName);
    await goToStep(dialog, 3);
    await expect(dialog.getByRole("button", { name: "Continue", exact: true })).toBeEnabled({ timeout: 45000 });
    releasePreview(); await completed; await page.unroute(endpoint);
    await goToStep(dialog, 5); await expect(ack).not.toBeChecked();
    expect((await owner.repository.load())!.mealPlan).toEqual(groupBefore);
    expect(await page.evaluate(key => localStorage.getItem(key), otherDraftKey)).toBe("keep this unrelated draft");
    await close.click(); await generate.click(); await expect(discard).toBeVisible(); await discard.click();
    await expect(discard).toHaveCount(0); await close.click(); await generate.click(); await expect(discard).toHaveCount(0);
    await goToStep(dialog, 2); await reviewRecipe(dialog, recipeName); await choices.getByRole("spinbutton").fill("2");
    await chooseRecipe(dialog, recipeName);
    await close.click(); await generate.click(); await expect(discard).toBeVisible(); await goToStep(dialog, 2);
    await reviewRecipe(dialog, recipeName); await expect(choices.getByRole("spinbutton")).toHaveValue("2");
  } finally {
    releasePreview();
    await context.close(); await deleteLocalAccount(account);
  }
});

test("advisory individual and connected stepped previews preserve drafts, review, retry and privacy", async ({ browser }, info) => {
  test.setTimeout(300000);
  const a = await createLocalAccount("advisory-owner"), b = await createLocalAccount("advisory-recipient");
  const ca = await createAuthenticatedContext(browser, info.project.use.baseURL!, a), cb = await createAuthenticatedContext(browser, info.project.use.baseURL!, b);
  try {
    const owner = await fixture(a, true), recipient = await fixture(b, false);
    const snapshot = (await owner.repository.load())!;
    await owner.repository.saveRecipe({ currentSnapshot: snapshot, newFoods: [], idempotencyKey: crypto.randomUUID(), meal: {
      id: `advisory-${crypto.randomUUID()}`, name: "Advisory chicken", servings: 4, complexity: "easy", notes: "Cook and serve.", totalTimeMinutes: 45,
      mealSlots: ["breakfast", "lunch", "dinner", "snack"], ingredients: [{ foodId: "food-chicken", servings: 1 }],
      unmeasuredIngredients: [{ name: "Soy sauce", measurement: "To taste" }, { name: "Cucumber", measurement: "To taste" }],
      providedNutrition: { calories: 500, proteinG: 10, carbsG: 100, fatG: 5 },
    } });
    const pa = await ca.newPage(), pb = await cb.newPage();
    await pa.goto("/nutrition");
    for (let i = 0; i < 2; i++) await pa.getByRole("button", { name: "Next week", exact: true }).click();
    const generate = pa.getByRole("button", { name: "Generate", exact: true });
    await expect(generate).toBeEnabled(); await generate.click();
    const dialog = pa.getByRole("dialog", { name: "Generate plan", exact: true });
    const next = dialog.getByRole("button", { name: "Continue", exact: true });
    const choices = dialog.getByRole("group", { name: "Choose recipes", exact: true });
    const warnings = dialog.getByRole("region", { name: "Recipe warnings", exact: true });
    const ack = dialog.getByRole("checkbox", { name: /^I reviewed the assignments/ });
    const daily = dialog.locator('[aria-label="Daily planned preview"]');
    const dayButtons = daily.getByRole("group", { name: "Choose a day" }).getByRole("button");
    const save = dialog.getByRole("button", { name: "Save plan", exact: true });
    await expect(dialog.locator("[data-stepper]")).toContainText("step 1 of 5");
    await expect(dialog.getByRole("group", { name: "Choose days step", exact: true })).toBeVisible();
    await expect(choices).toHaveCount(0);
    await expect(save).toHaveCount(0);
    const selectedDays = dialog.getByRole("group", { name: "Choose days", exact: true });
    await selectedDays.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(next).toBeDisabled();
    await selectedDays.getByRole("button", { name: "Select all", exact: true }).click();
    await next.focus(); await pa.keyboard.press("Enter");
    await expect(dialog.locator("[data-stepper] h3")).toBeFocused();
    await expect(warnings).toHaveCount(0);
    await choices.getByRole("button", { name: "Select all", exact: true }).click();
    await goToStep(dialog, 5);
    await expect(dialog.locator("[data-stepper] h3")).toHaveText("Review");
    await expect(warnings.getByRole("heading", { name: "Recipe warnings", exact: true })).toBeVisible();
    await expect(warnings.locator("details")).not.toHaveAttribute("open");
    await expect(warnings.getByRole("button", { name: /^Remove recipe:/ })).toHaveCount(0);
    await expandReview(warnings);
    expect(await warnings.getByRole("button", { name: /^Remove recipe:/ }).count()).toBeGreaterThan(1);
    await dialog.getByRole("button", { name: "Edit recipes", exact: true }).click();
    await goToStep(dialog, 5);
    await expect(warnings.getByRole("button", { name: "Collapse all recipe warnings", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Edit recipes", exact: true }).click();
    await choices.getByRole("button", { name: "Clear", exact: true }).click(); await expect(next).toBeDisabled();
    await chooseRecipe(dialog, "Advisory chicken");
    await goToStep(dialog, 3);
    await expect(warnings).toHaveCount(0);
    await expect(daily.getByRole("heading")).toHaveText(["Breakfast", "Lunch", "Dinner", "Snack"]);
    await expect(daily.getByRole("spinbutton")).toHaveCount(0);
    await dayButtons.nth(1).click();
    await goToStep(dialog, 2); await goToStep(dialog, 3);
    await expect(dayButtons.nth(1)).toHaveAttribute("aria-pressed", "true");
    await goToStep(dialog, 5);
    await expect(warnings).toContainText("Soy sauce");
    // The random seed may place multiple one-serving assignments on the same day.
    await expect(dialog.getByRole("region", { name: "Daily preference warnings" })).toContainText(/Estimated daily total: [1-4]00 g total carbs; your preference is 50 g/);
    await expect(save).toBeDisabled(); await ack.check();
    await expandReview(warnings);
    await warnings.getByRole("button", { name: "Remove recipe: Advisory chicken", exact: true }).click();
    await expect(dialog.locator("[data-stepper] h3")).toHaveText("Review");
    await expect(ack).not.toBeChecked(); await expect(save).toBeDisabled();
    await dialog.getByRole("button", { name: "Edit recipes", exact: true }).click();
    await expect(recipeRow(dialog, "Advisory chicken")).not.toContainText("Added");
    await chooseRecipe(dialog, "Advisory chicken");
    await goToStep(dialog, 5);
    await expect(ack).toHaveCSS("width", "24px");
    await ack.locator("..").getByText(/^I reviewed/).click(); await expect(ack).toBeChecked();
    await ack.locator("..").click({ position: { x: 4, y: 4 } }); await expect(ack).not.toBeChecked();
    await ack.focus(); await pa.keyboard.press("Space"); await expect(ack).toBeChecked();
    await checkReviewDisclosures(pa, dialog, false);
    await dialog.getByRole("button", { name: "Edit preview", exact: true }).click();
    await dayButtons.nth(2).click(); await goToStep(dialog, 5); await expect(ack).toBeChecked();
    await expect(warnings.locator("details")).toHaveAttribute("open", "");
    await checkReviewLayout(pa, dialog, false, `personal-${info.project.name}`);
    await dialog.getByRole("button", { name: "Close generate plan", exact: true }).click();
    await expect(generate).toBeFocused(); await generate.click();
    await expect(dialog.locator("[data-stepper]")).toContainText("step 1 of 5");
    await goToStep(dialog, 2);
    await expect(recipeRow(dialog, "Advisory chicken")).toContainText("Added");
    await goToStep(dialog, 5); await expect(ack).not.toBeChecked(); await ack.check();
    let releaseSave!: () => void;
    const held = new Promise<void>(resolve => { releaseSave = resolve; });
    let firstKey = "";
    const saveEndpoint = "**/rest/v1/rpc/generate_nutrition_week";
    await pa.route(saveEndpoint, async route => {
      firstKey = route.request().postDataJSON().p_payload.idempotencyKey;
      await held;
      await route.fulfill({ status: 503, json: { message: "Temporary save failure" } });
    });
    await save.click();
    await expect(dialog.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Close generate plan", exact: true })).toBeDisabled();
    await pa.keyboard.press("Escape"); await expect(dialog).toBeVisible();
    releaseSave();
    await expect(dialog.getByText(/The save was not confirmed/)).toBeVisible();
    await expect(ack).toBeChecked();
    await pa.unroute(saveEndpoint);
    const retried = pa.waitForRequest(request => request.url().includes("/rpc/generate_nutrition_week"));
    await save.click(); expect((await retried).postDataJSON().p_payload.idempotencyKey).toBe(firstKey);
    await expect(dialog).not.toBeVisible();
    console.log("Personal stepped flow, draft recovery and retry verified");

    const invite = await owner.client.rpc("cooking_group_command", { p_payload: { action: "invite", grocerySharingAcknowledgment: "all-weeks-v1", idempotencyKey: crypto.randomUUID() } });
    if (invite.error) throw invite.error;
    const invitation = invite.data as { pin: string; group: { revision: number } };
    const inspected = await recipient.client.rpc("cooking_group_command", { p_payload: { action: "inspect-pin", pin: invitation.pin } }); if (inspected.error) throw inspected.error;
    const joined = await recipient.client.rpc("cooking_group_command", { p_payload: { action: "join", grocerySharingAcknowledgment: "all-weeks-v1", pin: invitation.pin, groupRevision: invitation.group.revision, idempotencyKey: crypto.randomUUID() } }); if (joined.error) throw joined.error;
    await pa.reload();
    for (let i = 0; i < 2; i++) await pa.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(generate).toBeEnabled(); await generate.click();
    await expect(dialog.locator("[data-stepper]")).toContainText("step 1 of 5");
    const people = dialog.getByRole("group", { name: "People", exact: true });
    const setupHelp = dialog.getByRole("button", { name: "About setup", exact: true });
    await expect(dialog.getByText(/^Only selected people and days change/)).toHaveCount(0);
    await setupHelp.click();
    await expect(pa.getByRole("dialog", { name: "Setup", exact: true })).toContainText("Eaten entries and their linked planned meals stay intact");
    await pa.keyboard.press("Escape"); await expect(setupHelp).toBeFocused();
    await people.getByRole("checkbox", { name: "Same name (you)", exact: true }).uncheck();
    await people.getByRole("checkbox", { name: "Same name", exact: true }).uncheck(); await expect(next).toBeDisabled();
    await people.getByRole("checkbox", { name: "Same name (you)", exact: true }).check();
    await people.getByRole("checkbox", { name: "Same name", exact: true }).check();
    const setupDays = dialog.getByRole("group", { name: "Choose days", exact: true });
    await expect(people).toBeVisible(); await expect(setupDays).toBeVisible();
    await expect(dialog.getByRole("group", { name: "Planning mode", exact: true })).toBeVisible();
    await setupDays.getByRole("button", { name: "Clear", exact: true }).click(); await expect(next).toBeDisabled();
    await setupDays.getByRole("button", { name: "Select all", exact: true }).click();
    await expect(dialog.getByRole("radio", { name: "Fill empty meals", exact: true })).toBeChecked();
    await dialog.getByRole("radio", { name: "Replace planned meals on selected days", exact: true }).check();
    await dialog.getByRole("radio", { name: "Fill empty meals", exact: true }).check();
    await goToStep(dialog, 2);
    const batch = choices.getByRole("spinbutton", { name: "Batches for Advisory chicken", exact: true });
    await dialog.getByRole("button", { name: "About choose recipes", exact: true }).click();
    await expect(pa.getByRole("dialog", { name: "Choose recipes", exact: true })).toContainText("Batches set the most you may cook this week");
    await expect(pa.getByRole("dialog", { name: "Choose recipes", exact: true })).toContainText("Preference conflicts are warnings");
    await pa.keyboard.press("Escape");
    await expect(choices).toContainText("0 added"); await expect(next).toBeDisabled();
    await reviewRecipe(dialog, "Advisory chicken"); await expect(batch).toHaveValue("1");
    await batch.fill("3"); await expect(next).toBeDisabled();
    await goToStep(dialog, 1);
    await people.getByRole("checkbox", { name: "Same name", exact: true }).uncheck();
    await goToStep(dialog, 2); await expect(batch).toHaveValue("3");
    await choices.getByRole("button", { name: "Select all", exact: true }).click();
    await reviewRecipe(dialog, "Advisory chicken"); await expect(batch).toHaveValue("1");
    await choices.getByRole("button", { name: "Clear", exact: true }).click(); await expect(next).toBeDisabled();
    await reviewRecipe(dialog, "Advisory chicken"); await expect(batch).toHaveValue("1");
    await batch.fill("2"); await chooseRecipe(dialog, "Advisory chicken");
    await reviewRecipe(dialog, "Advisory chicken");
    await goToStep(dialog, 1);
    await people.getByRole("checkbox", { name: "Same name", exact: true }).check();
    await goToStep(dialog, 2); await expect(batch).toHaveValue("2");
    await dialog.getByRole("button", { name: "Close generate plan", exact: true }).click();
    await generate.click(); await goToStep(dialog, 2);
    await expect(dialog.getByText("Group draft restored. A fresh preview requires your review before saving.")).toBeVisible();
    await reviewRecipe(dialog, "Advisory chicken"); await expect(batch).toHaveValue("2");
    await batch.fill("0"); await expect(next).toBeDisabled();
    await batch.fill("2"); await goToStep(dialog, 3);
    await expect(next).toBeEnabled({ timeout: 45000 });
    await expect(warnings).toHaveCount(0);
    await goToStep(dialog, 5);
    await expect(warnings).toContainText("Soy sauce", { timeout: 45000 });
    await expect(warnings).not.toContainText("foods to avoid (cucumber)");
    await ack.check();
    await expandReview(warnings);
    await warnings.getByRole("button", { name: "Remove recipe: Advisory chicken", exact: true }).click();
    await expect(dialog.locator("[data-stepper] h3")).toHaveText("Review");
    await expect(ack).not.toBeChecked(); await expect(save).toBeDisabled();
    await dialog.getByRole("button", { name: "Edit recipes", exact: true }).click();
    await expect(recipeRow(dialog, "Advisory chicken")).not.toContainText("Added");
    await chooseRecipe(dialog, "Advisory chicken");
    await reviewRecipe(dialog, "Advisory chicken"); await expect(batch).toHaveValue("1"); await batch.fill("2");
    await goToStep(dialog, 3); await expect(next).toBeEnabled({ timeout: 45000 });
    const person = daily.getByRole("combobox", { name: "Person", exact: true });
    const ownerId = (await owner.client.auth.getUser()).data.user!.id;
    const recipientId = (await recipient.client.auth.getUser()).data.user!.id;
    let previewRequests = 0;
    pa.on("request", request => { if (request.url().includes("/functions/v1/cooking-group-preview")) previewRequests++; });
    await expect(person).toHaveValue(ownerId);
    let keptFound = false;
    for (let i = 0; i < 7; i++) { await dayButtons.nth(i).click(); if (await daily.getByText("Kept", { exact: true }).count()) { keptFound = true; break; } }
    expect(keptFound).toBe(true);
    await person.selectOption(recipientId); await dayButtons.nth(1).click();
    const selectedDate = await dayButtons.nth(1).getAttribute("data-date");
    const beforeNavigation = previewRequests;
    await goToStep(dialog, 5); await ack.check();
    await checkReviewDisclosures(pa, dialog, true);
    await expect(dialog.getByText("Some meal slots are still unfilled.", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText(/^Personal warnings shown here/)).toHaveCount(0);
    await dialog.getByRole("button", { name: "About review", exact: true }).click();
    await expect(pa.getByRole("dialog", { name: "Review", exact: true })).toContainText("each selected member receives their own private review after saving");
    await pa.keyboard.press("Escape"); await expect(ack).toBeChecked();
    expect(previewRequests).toBe(beforeNavigation);
    for (const label of ["Edit people", "Edit days", "Edit planning mode"]) {
      await dialog.getByRole("button", { name: label, exact: true }).click();
      await expect(dialog.locator("[data-stepper]")).toContainText("step 1 of 5");
      await expect(dialog.locator("[data-stepper] h3")).toHaveText("Setup");
      await expect(people.getByRole("checkbox", { name: "Same name (you)", exact: true })).toBeChecked();
      await expect(people.getByRole("checkbox", { name: "Same name", exact: true })).toBeChecked();
      await expect(setupDays.locator('input:checked')).toHaveCount(7);
      await expect(dialog.getByRole("radio", { name: "Fill empty meals", exact: true })).toBeChecked();
      await goToStep(dialog, 5); await expect(ack).toBeChecked();
      await expect(warnings.locator("details")).toHaveAttribute("open", "");
      expect(previewRequests).toBe(beforeNavigation);
    }
    await dialog.getByRole("button", { name: "Edit preview", exact: true }).click();
    await expect(person).toHaveValue(recipientId);
    await expect(daily.locator(`[data-date="${selectedDate}"]`)).toHaveAttribute("aria-pressed", "true");
    await goToStep(dialog, 5); await expect(ack).toBeChecked(); expect(previewRequests).toBe(beforeNavigation);
    await checkReviewLayout(pa, dialog, true, `group-${info.project.name}`);
    expect(previewRequests).toBe(beforeNavigation);
    await goToStep(dialog, 3);
    let serving;
    for (let i = 0; i < 7; i++) { await dayButtons.nth(i).click(); if (await daily.getByRole("spinbutton").count()) { serving = daily.getByRole("spinbutton").first(); break; } }
    expect(serving).toBeDefined();
    const revisedServings = await serving!.inputValue() === "0.25" ? "0.5" : "0.25";
    await serving!.fill("0.1"); await serving!.blur(); await expect(next).toBeDisabled();
    await expect(serving!).toHaveAttribute("aria-invalid", "true");
    const previewEndpoint = "**/functions/v1/cooking-group-preview";
    await pa.route(previewEndpoint, route => route.fulfill({ status: 503, json: { message: "Preview unavailable. Your choices are retained." } }));
    await serving!.fill(revisedServings); await serving!.blur();
    await expect(dialog.getByRole("alert")).toContainText("Your choices are retained.");
    await expect(daily.getByRole("listitem")).toHaveCount(0); await expect(next).toBeDisabled();
    await pa.unroute(previewEndpoint);
    await dialog.getByRole("button", { name: "Refresh preview and review", exact: true }).click();
    await expect(next).toBeEnabled({ timeout: 45000 });
    await goToStep(dialog, 5); await expect(ack).not.toBeChecked();
    await goToStep(dialog, 3);
    await pa.route(previewEndpoint, async route => {
      const response = await route.fetch(); const json = await response.json();
      json.assignments = []; json.resultingMeals = json.resultingMeals.filter((meal: { status: string }) => meal.status === "kept");
      await route.fulfill({ response, json });
    });
    await dialog.getByRole("button", { name: "Shuffle", exact: true }).click();
    await expect(next).toBeEnabled({ timeout: 45000 }); await goToStep(dialog, 5); await ack.check(); await expect(save).toBeDisabled();
    await pa.unroute(previewEndpoint); await goToStep(dialog, 3);
    await dialog.getByRole("button", { name: "Shuffle", exact: true }).click(); await expect(next).toBeEnabled({ timeout: 45000 });
    await pa.emulateMedia({ reducedMotion: "reduce" });
    await mkdir("output/generation-review", { recursive: true });
    for (let index = 1; index <= 5; index++) {
      await goToStep(dialog, index);
      for (const width of [320, 409, 1440]) {
        await pa.setViewportSize({ width, height: 930 });
        for (const enlarged of [false, true]) {
          await pa.evaluate(value => { document.documentElement.style.fontSize = value ? "200%" : ""; }, enlarged);
          await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
          await expect.poll(() => dialog.locator("[data-modal-footer]").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
          await expect.poll(() => dialog.locator("[data-modal-body]").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
          await expect.poll(() => dialog.locator("[data-modal-body]").evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(44);
          await expect(dialog.getByRole("button", { name: index === 5 ? "Save plan" : "Continue", exact: true })).toBeInViewport();
        }
        await pa.evaluate(() => { document.documentElement.style.fontSize = ""; });
        if (width !== 320) await pa.screenshot({ path: `output/generation-review/step-${index}-${width}-${info.project.name}.png` });
      }
    }
    await ack.check();
    await save.click();
    const success = pa.getByRole("dialog", { name: "You're all set!", exact: true });
    await expect(success).toBeVisible({ timeout: 45000 });
    await expect(success.getByRole("heading", { name: "Your review at generation" })).toHaveCount(0);
    await expect(success.locator("[data-review-disclosure]")).toHaveCount(0);
    await expect(success).not.toContainText("foods to avoid (soy)");
    await expect(success).not.toContainText("Daily preference warnings");
    await expect(success.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await checkSuccessSummary(pa, success, info.project.name);
    await success.getByRole("button", { name: "Done", exact: true }).click();
    await pb.goto("/grocery");
    const notice = pb.getByRole("dialog", { name: "You're all set!", exact: true });
    await expect(notice).toBeVisible({ timeout: 45000 });
    await expect(notice).not.toContainText("foods to avoid (cucumber)"); await expect(notice).not.toContainText("foods to avoid (soy)");
    await notice.getByRole("button", { name: "Done", exact: true }).click();
    await pb.goto("/nutrition"); await expect(notice).not.toBeVisible();
  } finally {
    await Promise.allSettled([ca.close(), cb.close()]);
    await Promise.all([deleteLocalAccount(a), deleteLocalAccount(b)]);
  }
});
