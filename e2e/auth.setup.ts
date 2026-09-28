import { test as setup, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertLocalSupabaseConfigured,
  createAuthenticatedContext,
  createLocalAccount,
  deleteLocalAccount,
  writeStorageState,
  type LocalAccount,
} from "./local-account";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const authDirectory = path.resolve("playwright/.auth");
const accountsFile = path.join(authDirectory, "test-accounts.json");
const states = ["user-a.json", "user-b.json"];

async function completeOnboarding(page: import("@playwright/test").Page, displayName: string) {
  await page.goto("/onboarding");
  await expect(page.getByText(/Onboarding · step 1 of/i)).toBeVisible();
  await page.getByLabel("What should we call you?").fill(displayName);
  await page.getByLabel("Age").fill("30");
  await page.getByText("None of the situations below apply to me", { exact: true }).click();
  await page.getByLabel("Height (cm)").fill("168");
  await page.getByLabel("Weight (kg)").fill("68");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByText("Maintain weight", { exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("button", { name: "Create my plan" })).toBeVisible();
  await page.getByRole("button", { name: "Create my plan" }).click();
  await expect(page).toHaveURL(new RegExp(`${new URL(baseURL).origin}/?$`));
  await expect(page.getByRole("heading", { name: "Today's meals", exact: true })).toBeVisible();
}

setup("prepare two fresh local authenticated fixtures", async ({ browser }) => {
  assertLocalSupabaseConfigured();
  await fs.mkdir(authDirectory, { recursive: true });
  const accounts: LocalAccount[] = [];
  try {
    for (const [index, displayName] of ["Fixture User A", "Fixture User B"].entries()) {
      const account = await createLocalAccount(`playwright-${index === 0 ? "a" : "b"}`);
      accounts.push(account);
      await fs.writeFile(accountsFile, JSON.stringify(accounts, null, 2), { encoding: "utf8", flag: "w" });
      const context = await createAuthenticatedContext(browser, baseURL, account);
      try {
        const page = await context.newPage();
        await completeOnboarding(page, displayName);
        if (index === 0) {
          await page.goto("/grocery");
          const fixtureName = "E2E Private Fixture A";
          await page.getByRole("textbox", { name: "Custom item name" }).fill(fixtureName);
          await page.getByRole("button", { name: "Add custom grocery item" }).click();
          await expect(page.getByText(fixtureName)).toBeVisible();
        }
        await writeStorageState(context, path.join(authDirectory, states[index]));
      } finally {
        await context.close();
      }
    }
    await fs.writeFile(accountsFile, JSON.stringify(accounts, null, 2), { encoding: "utf8", flag: "w" });
  } catch (error) {
    for (const state of states) await fs.rm(path.join(authDirectory, state), { force: true });
    await fs.rm(accountsFile, { force: true });
    const cleanupErrors: unknown[] = [];
    for (const account of accounts.reverse()) {
      try {
        await deleteLocalAccount(account);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "Fixture setup failed and local account cleanup was incomplete.");
    throw error;
  }
});
