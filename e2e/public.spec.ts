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
  await expect(page).toHaveTitle("Cali - Exercise and Meal Planner");
  await expect(page.getByRole("link", { name: "Cali - Exercise and Meal Planner" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to your coach" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email address" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("preserves signup values and shows accessible password mismatch errors", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 360, height: 780 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/auth/sign-up");

    const email = page.getByRole("textbox", { name: "Email address" });
    const password = page.getByLabel("Password", { exact: true });
    const confirmPassword = page.getByLabel("Confirm password", { exact: true });
    await email.fill("signup-test@example.com");
    await password.fill("Mvp1-Test-Pass");
    await confirmPassword.fill("Mvp1-Different-Pass");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText("Passwords do not match.");
    await expect(email).toHaveValue("signup-test@example.com");
    await expect(password).toHaveValue("Mvp1-Test-Pass");
    await expect(confirmPassword).toHaveValue("Mvp1-Different-Pass");
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expect(confirmPassword).toHaveAttribute("aria-invalid", "true");
    await expect(password).toHaveClass(/border-coral-300/);
    await expect(confirmPassword).toHaveClass(/border-coral-300/);
    await expect(page.locator("#password-error")).toHaveText("Passwords do not match.");
    await expect(page.locator("#confirmPassword-error")).toHaveText("Passwords do not match.");

    await confirmPassword.fill("Mvp1-Test-Pass");
    await expect(password).not.toHaveAttribute("aria-invalid", "true");
    await expect(confirmPassword).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#password-error")).toHaveCount(0);
    await expect(page.locator("#confirmPassword-error")).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  }
});

test("protects the nutrition route when no browser session exists", async ({ page }) => {
  await page.goto("/nutrition");

  if (isUnconfiguredCi) {
    await expect(page).toHaveURL(/\/auth\/configuration$/);
    return;
  }

  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fnutrition$/);
});
