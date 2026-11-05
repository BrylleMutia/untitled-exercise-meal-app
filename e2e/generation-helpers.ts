import { expect, type Locator } from "@playwright/test";

export async function reviewRecipe(dialog: Locator, name: string) {
  const details = dialog.locator('[data-card-swiper] details');
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await details.getByRole("button", { name: `Review ${name}`, exact: true }).click();
  await expect(dialog.getByRole("region", { name: `Recipe card: ${name}`, exact: true })).toBeVisible();
}
export async function chooseRecipe(dialog: Locator, name: string, selected = true) {
  await reviewRecipe(dialog, name);
  await dialog.getByRole("button", { name: selected ? "Add recipe" : "Skip recipe", exact: true }).click();
  await expect(dialog.locator('[data-swiper-card][aria-busy="true"]')).toHaveCount(0);
}
export function recipeRow(dialog: Locator, name: string) {
  return dialog.locator('[aria-label="Recipe choices"] > li').filter({ has: dialog.page().getByRole("button", { name: `Review ${name}`, exact: true, includeHidden: true }) });
}
