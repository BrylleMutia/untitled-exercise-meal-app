import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { validPhotoDataUrl } from "../supabase/functions/_shared/photoImage";

// This suite runs only against the runner's local Supabase. Providers are mocked;
// the real review RPC and refreshed history still run against disposable accounts.
async function openPhoto(page: Page, route = "/nutrition") {
  await page.goto(route);
  await page.locator(route === "/" ? "#home-add-meal-breakfast" : "#add-meal-breakfast").click();
  await page.getByRole("button", { name: "Take or upload photo", exact: true }).click();
}
async function upload(page: Page) {
  const attachment = process.env.CALI_PHOTO_TEST_IMAGE;
  const fixture = attachment || {
    name: "fixture.jpg", mimeType: "image/jpeg",
    buffer: await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#e8cda8" } }).jpeg().toBuffer(),
  };
  await page.getByLabel("Upload meal photo", { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole("img", { name: "Meal photo ready for analysis" })).toBeVisible();
}

const mockFoods = [
  { name: "White bread", preparation: "prepared", calories: 265, proteinG: 9, carbsG: 49, fatG: 3 },
  { name: "Chopped egg", preparation: "cooked", calories: 155, proteinG: 13, carbsG: 1, fatG: 11 },
] as const;
async function mockProviders(page: Page) {
  await page.route("**/functions/v1/nutrition-photo-parse", route => {
    const { image } = route.request().postDataJSON();
    expect(validPhotoDataUrl(image), "The browser should send a bounded JPEG after Estimate meal").toBe(true);
    return route.fulfill({ json: {
      status: "ok", suggestedMealName: "Egg sandwich", candidates: [
        { name: "White bread", preparation: "prepared", presence: "visible", confidence: "medium", portion: { low: 50, base: 60, high: 75, unit: "g" }, assumptions: [] },
        { name: "Chopped egg", preparation: "cooked", presence: "visible", confidence: "medium", portion: { low: 80, base: 100, high: 120, unit: "g" }, assumptions: [] },
        { name: "Mayonnaise", preparation: "prepared", presence: "possible_hidden", confidence: "low", portion: null, assumptions: ["Dressing cannot be identified from the photo alone."] },
      ], questions: ["Was mayonnaise or another dressing added?"],
    } });
  });
  await page.route("**/functions/v1/nutrition-meal-match", route => {
    expect(route.request().postDataJSON().ingredients.map((item: { name: string }) => item.name)).toEqual(mockFoods.map(food => food.name));
    return route.fulfill({ json: { matches: mockFoods.map(({ name, preparation, ...nutrients }, index) => ({
      ingredientIndex: index, query: name, candidates: [{
        fdcId: `photo-fixture-${index}`, recordType: "Foundation", name, servingLabel: "100 g", servingGrams: 100, unit: "g",
        ...nutrients, nutrientsPer100g: nutrients,
        source: "USDA", sourceVersion: "photo-test-v1", estimated: false, confidence: "high", preparationBasis: preparation,
      }],
    })) } });
  });
}

test("photo preview requires review, preserves retry identity, and saves uncertain history", async ({ page }, info) => {
  await mockProviders(page);
  let analysisRequests = 0;
  page.on("request", request => { if (request.url().endsWith("nutrition-photo-parse")) analysisRequests++; });
  await openPhoto(page);
  await upload(page);
  expect(analysisRequests).toBe(0);
  await page.getByRole("button", { name: "Estimate meal", exact: true }).click();
  const preview = page.getByRole("region", { name: "Photo macro estimate" });
  await expect(preview.getByRole("heading", { name: "Rough estimate", exact: true })).toBeVisible();
  await expect(preview).toContainText("Was mayonnaise or another dressing added?");
  await expect(preview).toContainText("Mayonnaise · amount unknown · excluded");
  await expect(preview.getByRole("group", { name: "Photo meal estimate" })).toContainText(/314\s*kcal/);
  await preview.screenshot({ path: info.outputPath("photo-estimate.png") });
  await expect.poll(() => page.evaluate(async () => {
    const storedDraft = await new Promise<string>((resolve, reject) => {
      const open = indexedDB.open("calicoach-drafts", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const read = db.transaction("drafts", "readonly").objectStore("drafts").getAll();
        read.onsuccess = () => { db.close(); resolve(JSON.stringify(read.result)); };
        read.onerror = () => { db.close(); reject(read.error); };
      };
    });
    return { hasReviewedFoods: storedDraft.includes("White bread"), hasImage: storedDraft.includes("data:image/") };
  })).toEqual({ hasReviewedFoods: true, hasImage: false });
  await expect(page.getByRole("img", { name: "Meal photo ready for analysis" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Log meal", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Review meal", exact: true }).click();
  const review = page.getByRole("region", { name: "Guided meal review", exact: true });
  await expect(review).toBeFocused();
  const confirmations = review.getByRole("checkbox", { name: "I reviewed this food, portion, and preparation", exact: true });
  await confirmations.nth(0).check(); await confirmations.nth(1).check();
  await expect(confirmations.nth(0)).toBeChecked();
  await expect(review.getByRole("button", { name: "Log meal", exact: true })).toBeEnabled();
  await review.getByLabel("White bread quantity", { exact: true }).fill("80");
  await expect(preview.getByRole("group", { name: "Photo meal estimate" })).toContainText(/367\s*kcal/);
  await expect(confirmations.nth(0)).not.toBeChecked(); await expect(confirmations.nth(1)).toBeChecked();
  await confirmations.nth(0).check();
  const name = `Photo history ${info.project.name}`;
  await review.getByLabel("Meal name", { exact: true }).fill(name);
  await page.evaluate(() => { document.documentElement.style.fontSize = "24px"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("photo-review.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  const payloads: Array<{ idempotencyKey: string; ingredients: Array<{ confidence: string; estimated: boolean; assumptions: string }> }> = [];
  await page.route("**/rest/v1/rpc/save_reviewed_meal", async route => {
    payloads.push(route.request().postDataJSON().p_payload);
    if (payloads.length === 1) await route.fulfill({ status: 503, json: { message: "Temporary test failure" } });
    else await route.continue();
  });
  await review.getByRole("button", { name: "Log meal", exact: true }).click();
  await expect(review.getByRole("button", { name: "Log meal", exact: true })).toBeEnabled();
  await review.getByRole("button", { name: "Log meal", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Add meal", exact: true })).toHaveCount(0);
  expect(payloads).toHaveLength(2);
  expect(payloads[0].idempotencyKey).toBe(payloads[1].idempotencyKey);
  expect(payloads[1].ingredients).toHaveLength(2);
  expect(payloads[1].ingredients.every(item => item.estimated && item.confidence === "low" && item.assumptions.includes("USDA"))).toBe(true);
  expect(JSON.stringify(payloads)).not.toContain("data:image");
  await page.reload();
  const savedRow = page.getByRole("region", { name: "Breakfast", exact: true })
    .getByRole("listitem", { name: `Eaten meal: ${name}`, exact: true });
  await expect(savedRow).toHaveCount(1);
});

test("camera denial preserves manual logging", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => { throw new DOMException("Denied", "NotAllowedError"); } });
  });
  await openPhoto(page, "/");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(page.getByRole("region", { name: "Meal photo" }).getByRole("alert")).toContainText("Camera access is unavailable");
  await page.getByRole("button", { name: "Back to meal entry", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enter manually", exact: true })).toBeVisible();
});

test("camera capture and late permissions release every video track", async ({ page }) => {
  await page.addInitScript(() => {
    const tracks: MediaStreamTrack[] = [];
    Object.defineProperty(window, "photoTracksEnded", { value: () => tracks.length > 0 && tracks.every(track => track.readyState === "ended") });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => {
      const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 480;
      const context = canvas.getContext("2d")!; context.fillStyle = "#e8cda8"; context.fillRect(0, 0, 640, 480);
      const stream = canvas.captureStream(1); tracks.push(...stream.getTracks());
      await new Promise(resolve => setTimeout(resolve, 150));
      return stream;
    } });
  });
  await openPhoto(page, "/");
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take photo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.getByRole("img", { name: "Meal photo ready for analysis" })).toBeVisible();
  const stopped = () => page.evaluate(() => (window as unknown as { photoTracksEnded: () => boolean }).photoTracksEnded());
  await expect.poll(stopped).toBe(true);
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await page.getByRole("button", { name: "Back to meal entry", exact: true }).click();
  await expect.poll(stopped).toBe(true);
});

test("photo review can add an estimated future meal through the existing advisory RPC", async ({ page }, info) => {
  await mockProviders(page); await openPhoto(page); await upload(page);
  await page.getByRole("button", { name: "Estimate meal", exact: true }).click();
  await page.getByRole("button", { name: "Review meal", exact: true }).click();
  const review = page.getByRole("region", { name: "Guided meal review", exact: true });
  const checks = review.getByRole("checkbox", { name: "I reviewed this food, portion, and preparation", exact: true });
  await checks.nth(0).check(); await checks.nth(1).check();
  await review.getByLabel("Meal name").fill(`Photo plan ${info.project.name}`);
  const saved = page.waitForResponse(response => response.url().endsWith("/rpc/add_planned_meal"));
  await review.getByRole("button", { name: "Add to plan", exact: true }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBe(true);
  await expect(page.getByRole("dialog", { name: "Add meal", exact: true })).toHaveCount(0);
});
