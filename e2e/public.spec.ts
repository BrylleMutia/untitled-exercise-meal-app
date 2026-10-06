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
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("account help supports hover and keyboard without losing form values", async ({ page }) => {
  await page.goto("/auth/sign-up");
  const email = page.getByRole("textbox", { name: "Email address" });
  await email.fill("help-draft@example.test");
  await expect(page.getByText("Use at least 8 characters.", { exact: true })).toBeVisible();
  const help = page.getByRole("button", { name: "About Create your account", exact: true });
  const dialog = page.getByRole("dialog", { name: "Create your account", exact: true });
  await help.hover();
  await expect(dialog).toBeVisible();
  await expect(email).toBeFocused();
  await help.click();
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(email).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(help).toBeFocused();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Space");
  await expect(dialog).toBeFocused();
  await dialog.getByRole("button", { name: "Close Create your account help" }).click();
  await expect(email).toHaveValue("help-draft@example.test");
  await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
  await help.click();
  await email.click({ position: { x: 8, y: 8 } });
  await expect(email).toBeFocused();
  await expect(dialog).toHaveCount(0);
});

test("account instructions and help remain available on sign-in, confirmation and password screens", async ({ page }) => {
  const screens = [
    { route: "/auth/sign-in", title: "Sign in to your coach", input: "Email address", value: "help-draft@example.test" },
    { route: "/auth/check-email", title: "Check your email", input: "Signup email", value: "help-draft@example.test" },
    { route: "/auth/update-password", title: "Choose a fresh password", input: "New password", value: "Draft-password-123" },
  ];
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of screens) {
      await page.goto(screen.route);
      const input = page.getByLabel(screen.input, { exact: true });
      await input.fill(screen.value);
      await page.getByRole("button", { name: `About ${screen.title}`, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: screen.title, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog).toBeFocused();
      await dialog.getByRole("button", { name: `Close ${screen.title} help`, exact: true }).click();
      await expect(input).toHaveValue(screen.value);
      await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
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

test("keeps the sign-up fields and password visibility control in keyboard order", async ({ page }) => {
  await page.goto("/auth/sign-up");
  const email = page.getByRole("textbox", { name: "Email address" });
  const password = page.getByLabel("Password", { exact: true });
  const showPassword = page.getByRole("button", { name: "Show password" });
  const confirmPassword = page.getByLabel("Confirm password", { exact: true });

  await email.focus();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(showPassword).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirmPassword).toBeFocused();
});

test("protects the nutrition route when signed out or Supabase is not configured", async ({ page }) => {
  await page.goto("/nutrition");

  if (isUnconfiguredCi) {
    await expect(page).toHaveURL(/\/auth\/configuration$/);
    return;
  }

  await expect(page).toHaveURL(/\/auth\/(?:sign-in\?next=%2Fnutrition|configuration)$/);
  await expect(page.getByRole("heading", { name: /Sign in to your coach|Connect Supabase first/ })).toBeVisible();
});
