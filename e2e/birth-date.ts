import { expect, type Page } from "@playwright/test";

export async function selectBirthday(page: Page, age: number) {
  const year = await page.evaluate(() => new Date().getFullYear());
  const wheel = page.getByRole("listbox", { name: "Year", exact: true });
  await wheel.focus();
  await wheel.press("Home");
  await wheel.pressSequentially(String(year - age));
  await page.getByRole("listbox", { name: "Month", exact: true }).press("Home");
  await page.getByRole("listbox", { name: "Day", exact: true }).press("Home");
  await expect(page.getByText(`Age: ${age} years`, { exact: true })).toBeVisible();
}
