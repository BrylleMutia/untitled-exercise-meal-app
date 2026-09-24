import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

// CI intentionally runs without a Supabase project secret or public project
// configuration. In that environment the middleware must expose the safe
// configuration screen instead of pretending that authentication is ready.
// Local runs keep exercising the real public sign-in surface when .env.local
// supplies the configured project values.
const isUnconfiguredCi = Boolean(process.env.CI && !process.env.NEXT_PUBLIC_SUPABASE_URL);

test("serves the public sign-in surface without authenticated state", async ({ page }) => {
  await page.goto("/auth/sign-in?next=%2F");
  await expect(page.getByRole("heading", { name: "Sign in to your coach" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("protects the nutrition route when no browser session exists", async ({ page }) => {
  await page.goto("/nutrition");

  if (isUnconfiguredCi) {
    await expect(page).toHaveURL(/\/auth\/configuration$/);
    return;
  }

  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fnutrition$/);
});
