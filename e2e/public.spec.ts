import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("serves the public sign-in surface without authenticated state", async ({ page }) => {
  await page.goto("/auth/sign-in?next=%2F");
  await expect(page.getByRole("heading", { name: "Sign in to your coach" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("protects the nutrition route when no browser session exists", async ({ page }) => {
  await page.goto("/nutrition");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fnutrition$/);
});
